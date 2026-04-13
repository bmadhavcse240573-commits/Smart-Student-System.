const express = require('express');
const router = express.Router();
const Admin = require('../mockDb').Admin;
const FileStorage = require('../storage/fileStorage');

// Get all admins
router.get('/', async (req, res) => {
  try {
    const admins = await Admin.findAll();
    res.json(admins);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching admins: ' + err.message });
  }
});

// Get admin by ID
router.get('/:id', async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    res.json(admin);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching admin: ' + err.message });
  }
});

// Update admin
router.put('/:id', async (req, res) => {
  try {
    const { fullName, email, password, adminId, role } = req.body;

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Update fields
    if (fullName) admin.fullName = fullName;
    if (email) admin.email = email;
    if (password) admin.password = password; // Note: In production, hash the password
    if (adminId) admin.adminId = adminId;
    if (role) admin.role = role;

    await admin.save();

    res.json({
      message: 'Admin updated successfully',
      admin: {
        id: admin._id,
        fullName: admin.fullName,
        email: admin.email,
        adminId: admin.adminId,
        role: admin.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error updating admin: ' + err.message });
  }
});

// Delete admin
router.delete('/:id', async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await Admin.deleteById(req.params.id);
    res.json({ message: 'Admin deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting admin: ' + err.message });
  }
});

module.exports = router;