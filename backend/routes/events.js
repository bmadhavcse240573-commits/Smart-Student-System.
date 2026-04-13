const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const EVENTS_FILE = path.join(__dirname, '../data/eventRegistrations.json');

// Helper to read data
function readEventData() {
  try {
    if (fs.existsSync(EVENTS_FILE)) {
      return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading event data:', err);
  }
  return { registrations: [] };
}

// Helper to write data
function writeEventData(data) {
  try {
    fs.writeFileSync(EVENTS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('Error writing event data:', err);
    return false;
  }
}

// Register for an event
router.post('/register', (req, res) => {
  try {
    const { eventId, studentEmail, studentName, studentPhone, eventName } = req.body;

    // Validation
    if (!eventId || !studentEmail || !studentName || !studentPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const data = readEventData();
    
    // Check if already registered
    const alreadyRegistered = data.registrations.some(reg => 
      reg.eventId === eventId && reg.studentEmail === studentEmail
    );

    if (alreadyRegistered) {
      return res.status(400).json({ 
        success: false, 
        message: 'You are already registered for this event' 
      });
    }

    // Add new registration
    const registration = {
      id: Date.now().toString(),
      eventId,
      eventName,
      studentName,
      studentEmail,
      studentPhone,
      registeredAt: new Date().toISOString(),
      status: 'confirmed'
    };

    data.registrations.push(registration);
    writeEventData(data);

    res.json({ 
      success: true, 
      message: 'Successfully registered for the event!',
      registrationId: registration.id 
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Error registering for event' });
  }
});

// Get all registrations for an event
router.get('/event/:eventId', (req, res) => {
  try {
    const { eventId } = req.params;
    const data = readEventData();
    const eventRegistrations = data.registrations.filter(reg => reg.eventId === eventId);
    
    res.json({ 
      success: true, 
      eventId, 
      registrations: eventRegistrations,
      totalRegistrations: eventRegistrations.length 
    });
  } catch (err) {
    console.error('Error fetching registrations:', err);
    res.status(500).json({ success: false, message: 'Error fetching registrations' });
  }
});

// Get all registrations for a student
router.get('/student/:email', (req, res) => {
  try {
    const { email } = req.params;
    const data = readEventData();
    const studentRegistrations = data.registrations.filter(reg => reg.studentEmail === email);
    
    res.json({ 
      success: true, 
      studentEmail: email,
      registrations: studentRegistrations,
      totalRegistrations: studentRegistrations.length 
    });
  } catch (err) {
    console.error('Error fetching student registrations:', err);
    res.status(500).json({ success: false, message: 'Error fetching student registrations' });
  }
});

// Cancel registration
router.delete('/cancel/:registrationId', (req, res) => {
  try {
    const { registrationId } = req.params;
    const data = readEventData();
    
    const index = data.registrations.findIndex(reg => reg.id === registrationId);
    if (index === -1) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    data.registrations.splice(index, 1);
    writeEventData(data);

    res.json({ success: true, message: 'Registration cancelled successfully' });
  } catch (err) {
    console.error('Error cancelling registration:', err);
    res.status(500).json({ success: false, message: 'Error cancelling registration' });
  }
});

module.exports = router;
