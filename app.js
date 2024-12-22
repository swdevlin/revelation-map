require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const winston = require('winston');
const knex = require('./db/connection');
const path = require('node:path')
const fs = require('fs');

const cors = require('cors');
const app = express();
const PORT = process.env.PORT;
app.use(cors());
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' })
  ]
});

// Middleware to parse JSON
app.use(express.json());

app.use(morgan('tiny', { stream: { write: (message) => logger.info(message.trim()) } }));

const sectorSelections = (ul, lr) => {
  const regions = [];
  if (isNaN(lr.sx)) {
    regions.push({
      sx:ul.sx,
      sy:ul.sy,
      minX: 1,
      maxX: 32,
      minY: 1,
      maxY: 40,
    });
  } else {
    if (ul.sx === lr.sx && ul.sy === lr.sy) {
      regions.push({
        sx:ul.sx,
        sy:ul.sy,
        minX: ul.hx,
        maxX: lr.hx,
        minY: ul.hy,
        maxY: lr.hy,
      });
    } else {
      for (let x = ul.sx; x <= lr.sx; x++)
        for (let y = ul.sy; y >= lr.sy; y--) {
          let minX, minY, maxX, maxY;
          if (x === ul.sx) {
            minX = ul.hx;
            if (x === lr.sx)
              maxX = lr.hx;
            else
              maxX = 32;
          } else if (x > ul.sx && x < lr.sx) {
            minX = 1;
            maxX = 32;
          } else {
            minX = 1;
            maxX = lr.sx;
          }

          if (y === ul.sy) {
            minY = ul.hy;
            if (x === lr.sx)
              maxY = lr.hy;
            else
              maxY = 40;
          }
          else if (y < ul.sy && y > lr.sy) {
            minY = 1;
            maxY = 40;
          } else {
            minY = 1;
            maxY = lr.hy;
          }
          regions.push({
            sx:x,
            sy:y,
            minX: minX,
            maxX: maxX,
            minY: minY,
            maxY: maxY,
          });
        }
    }
  }
  return regions;
}

const addClauses = (query, clauses) => {
  query.where(function() {
    this
      .where('sector.x', clauses[0].sx)
      .andWhere('sector.y', clauses[0].sy)
      .andWhereBetween('solar_system.x', [clauses[0].minX, clauses[0].maxX])
      .andWhereBetween('solar_system.y', [clauses[0].minY, clauses[0].maxY])
    ;
  });

  for (let i = 1; i < clauses.length; i++) {
    query.orWhere(function() {
      this
        .where('sector.x', clauses[i].sx)
        .andWhere('sector.y', clauses[i].sy)
        .andWhereBetween('solar_system.x', [clauses[i].minX, clauses[i].maxX])
        .andWhereBetween('solar_system.y', [clauses[i].minY, clauses[i].maxY])
      ;
    });
  }
}

const parseQueryParams = (req, res, next) => {
  try {
    const { ulsx, ulsy, ulhx, ulhy, lrsx, lrsy, lrhx, lrhy } = req.query;

    if (ulsx === undefined || ulsy === undefined) {
      return res.status(400).json({ error: 'At least upper left sector x and y required' });
    }

    if (lrsx !== undefined && lrsy !== undefined) {
      if (
        ulhx === undefined || ulhy === undefined ||
        lrhx === undefined || lrhy === undefined ||
        +ulsx > +lrsx || +ulsy < +lrsy
      ) {
        return res.status(400).json({ error: 'hex Xs and Ys incorrect' });
      }
    }
    req.ul = {
      sx: +ulsx,
      sy: +ulsy,
      hx: +ulhx,
      hy: +ulhy
    };

    req.lr = {
      sx: +lrsx,
      sy: +lrsy,
      hx: +lrhx,
      hy: +lrhy
    };

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Invalid query parameters' });
  }
};

app.get('/solarsystems', parseQueryParams, async (req, res) => {
  try {
    const clauses = sectorSelections(req.ul, req.lr);

    const query = knex('solar_system')
      .join('sector', 'solar_system.sector_id', 'sector.id')
      .select('solar_system.*', 'sector.x as sector_x', 'sector.y as sector_y', 'sector.name as sector_name');

    addClauses(query, clauses);

    const systems = await query;
    res.status(200).json(systems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve solar system data' });
  }
});

app.get('/stars', parseQueryParams, async (req, res) => {
  try {
    const clauses = sectorSelections(req.ul, req.lr);

    const query = knex('solar_system')
      .join('sector', 'solar_system.sector_id', 'sector.id')
      .select('solar_system.stars', 'solar_system.x', 'solar_system.y', 'sector.x as sector_x', 'sector.y as sector_y');

    addClauses(query, clauses);

    const systems = await query;

    res.status(200).json(systems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve solar system data' });
  }
});

app.get('/sectors', async (req, res) => {
  try {
    const sectors = await knex('sector').select('*').orderBy(['x', 'y']);
    res.status(200).json(sectors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve sectors' });
  }
});

app.get('/systemmap', async (req, res) => {
  try {
    const { sx, sy, hex } = req.query;

    const sectors = await knex('sector').select('*').where('x', parseInt(sx)).andWhere('y', parseInt(sy));
    const sector = sectors[0];
    let filePath = path.join(process.env.STELLAR_DATA, sector.name, `${hex}-map.svg`);
    fs.access(filePath, fs.constants.F_OK, (err) => {
      if (err) {
        // If the file does not exist, send a 404 response
        res.status(404).send('SVG file not found');
        return;
      }

      // Read and send the SVG file
      res.sendFile(filePath, (err) => {
        if (err) {
          console.error('Error sending SVG file:', err);
          res.status(500).send('Error serving the SVG file');
        }
      });
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve sectors' });
  }
});

app.use((req, res, next) => {
  const startTime = Date.now();

  // Log request start
  logger.info(`Received ${req.method} request for ${req.originalUrl}`);

  // Listen for the response finish event to log the time taken
  res.on('finish', () => {
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    logger.info(
      `Completed ${req.method} request for ${req.originalUrl} - Status: ${res.statusCode} - Time taken: ${timeTaken}ms`
    );
  });

  next();
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
