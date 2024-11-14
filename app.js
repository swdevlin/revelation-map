require('dotenv').config();
const express = require('express');
const knex = require('./db/connection');

const app = express();
const PORT = process.env.PORT;

// Middleware to parse JSON
app.use(express.json());

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
        for (let y = ul.sy; x <= lr.sy; y--) {
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

app.get('/solarsystems', async (req, res) => {
  try {
    const {ulsx, ulsy, ulhx, ulhy, lrsx, lrsy, lrhx, lrhy} = req.query;

    if (ulsx === undefined || ulsy === undefined) {
      return res.status(400).json({ error: 'At least upper left sector x and y required' });
    }

    const ul = {
      sx: +ulsx,
      sy: +ulsy,
      hx: +ulhx,
      hy: +ulhy
    };

    const lr = {
      sx: +lrsx,
      sy: +lrsy,
      hx: +lrhx,
      hy: +lrhy
    };

    const clauses = sectorSelections(ul, lr);

    // Query for solar systems within the specified sector and coordinate range
    const query = knex('solar_system')
      .join('sector', 'solar_system.sector_id', 'sector.id')
      .select('solar_system.*', 'sector.x as sector_x', 'sector.y as sector_y');

    addClauses(query, clauses);

    const systems = await query;
    res.status(200).json(systems);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve solar system data' });
  }
});

app.get('/stars', async (req, res) => {
  try {
    const {ulsx, ulsy, ulhx, ulhy, lrsx, lrsy, lrhx, lrhy} = req.query;

    if (ulsx === undefined || ulsy === undefined) {
      return res.status(400).json({ error: 'At least upper left sector x and y required' });
    }

    const ul = {
      sx: +ulsx,
      sy: +ulsy,
      hx: +ulhx,
      hy: +ulhy
    };

    const lr = {
      sx: +lrsx,
      sy: +lrsy,
      hx: +lrhx,
      hy: +lrhy
    };

    const clauses = sectorSelections(ul, lr);

    // Query for solar systems within the specified sector and coordinate range
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
