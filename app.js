require('dotenv').config();
const express = require('express');
const knex = require('./db/connection');

const app = express();
const PORT = process.env.PORT;

// Middleware to parse JSON
app.use(express.json());

// Route to get all solar systems within a specific sector and coordinate range
app.get('/solarsystems', async (req, res) => {
  try {
    const {
      upper_left_sector_x,
      upper_left_sector_y,
      upper_left_x,
      upper_left_y,
      lower_right_sector_x,
      lower_right_sector_y,
      lower_right_x,
      lower_right_y
    } = req.query;

    if (
      upper_left_sector_x === undefined ||
      upper_left_sector_y === undefined ||
      upper_left_x === undefined ||
      upper_left_y === undefined ||
      lower_right_sector_x === undefined ||
      lower_right_sector_y === undefined ||
      lower_right_x === undefined ||
      lower_right_y === undefined
    ) {
      return res.status(400).json({ error: 'Bounding box coordinates are required' });
    }

    // Query for solar systems within the specified sector and coordinate range
    const systems = await db('solar_system')
      .join('sector', 'solar_system.sector_id', 'sector.id')
      .whereBetween('sector.sector_x', [upper_left_sector_x, lower_right_sector_x])
      .andWhereBetween('sector.sector_y', [upper_left_sector_y, lower_right_sector_y])
      .andWhereBetween('solar_system.x', [upper_left_x, lower_right_x])
      .andWhereBetween('solar_system.y', [upper_left_y, lower_right_y])
      .select('*');

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
