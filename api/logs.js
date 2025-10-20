const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect();

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const result = await client.query('SELECT * FROM logs');
      res.status(200).json(result.rows);
    } catch (err) {
      console.error('Error retrieving logs:', err);
      res.status(500).json({ error: 'Error retrieving logs' });
    }
  } else if (req.method === 'POST') {
    const { timestamp, name, minutes, date } = req.body;

    // Enhanced Validation
    if (!timestamp || !name || !minutes || !date || isNaN(minutes)) {
      return res.status(400).json({ error: 'Missing required fields: timestamp, name, minutes, or date' });
    }

    try {
      await client.query(
        'INSERT INTO logs (timestamp, name, minutes, date) VALUES ($1, $2, $3, $4)',
        [timestamp, name, minutes, date]
      );
      res.status(201).json({ message: 'Log created successfully' });
    } catch (err) {
      console.error('Error inserting log:', err);
      res.status(500).json({ error: 'Error creating log' });
    }
  } else {
    res.status(405).json({ error: 'Method Not Allowed' });
  }
};
