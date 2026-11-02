const Student = require("../models/Student");

// Wraps each handler so errors become clean JSON messages
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    if (e.code === 11000)
      return res.status(400).json({ success: false, message: "This Student ID already exists" });
    if (e.name === "ValidationError" || e.name === "CastError")
      return res.status(400).json({ success: false, message: "Please check the entered details" });
    console.error(e);
    res.status(500).json({ success: false, message: "Server error. Please try again" });
  });

const notFound = (res) => res.status(404).json({ success: false, message: "Student not found" });

exports.getAll = wrap(async (req, res) => {
  const { search } = req.query;
  const safe = search ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const filter = search ? { $or: [{ name: new RegExp(safe, "i") }, { studentId: new RegExp(safe, "i") }] } : {};
  res.json(await Student.find(filter).sort({ studentId: 1 }));
});

exports.getOne = wrap(async (req, res) => {
  const s = await Student.findById(req.params.id);
  s ? res.json(s) : notFound(res);
});

exports.create = wrap(async (req, res) => {
  await Student.create(req.body);
  res.status(201).json({ success: true, message: "Student added successfully" });
});

exports.update = wrap(async (req, res) => {
  const s = await Student.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  s ? res.json({ success: true, message: "Student updated successfully" }) : notFound(res);
});

exports.remove = wrap(async (req, res) => {
  const s = await Student.findByIdAndDelete(req.params.id);
  s ? res.json({ success: true, message: "Student deleted successfully" }) : notFound(res);
});
