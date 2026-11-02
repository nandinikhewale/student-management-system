const mongoose = require("mongoose");

const studentSchema = new mongoose.Schema({
  studentId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  department: { type: String, trim: true },
  semester: { type: Number, min: 1, max: 12 },
  contact: { type: String, trim: true },
});

module.exports = mongoose.model("Student", studentSchema);
