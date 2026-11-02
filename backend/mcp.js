// MCP server: lets Claude manage students through tools
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { z } = require("zod");
const Student = require("./models/Student");

const text = (t) => ({ content: [{ type: "text", text: t }] });
const fields = {
  name: z.string(),
  email: z.string(),
  department: z.string().optional(),
  semester: z.number().optional(),
  contact: z.string().optional(),
};

function buildServer() {
  const server = new McpServer({ name: "student-management", version: "1.0.0" });

  server.registerTool(
    "add_student",
    { description: "Add a new student record", inputSchema: { studentId: z.string(), ...fields } },
    async (args) => {
      await Student.create(args);
      return text(`Added ${args.name} (${args.studentId})`);
    }
  );

  server.registerTool(
    "list_students",
    { description: "List all students, or search by name or student ID", inputSchema: { search: z.string().optional() } },
    async ({ search }) => {
      const safe = search ? search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
      const filter = search ? { $or: [{ name: new RegExp(safe, "i") }, { studentId: new RegExp(safe, "i") }] } : {};
      return text(JSON.stringify(await Student.find(filter).sort({ studentId: 1 }), null, 2));
    }
  );

  server.registerTool(
    "get_student",
    { description: "Get one student by studentId, e.g. ST101", inputSchema: { studentId: z.string() } },
    async ({ studentId }) => {
      const s = await Student.findOne({ studentId });
      return text(s ? JSON.stringify(s, null, 2) : "Student not found");
    }
  );

  server.registerTool(
    "update_student",
    {
      description: "Update an existing student by studentId. Pass only the fields that change.",
      inputSchema: { studentId: z.string(), ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])) },
    },
    async ({ studentId, ...changes }) => {
      const s = await Student.findOneAndUpdate({ studentId }, changes, { new: true, runValidators: true });
      return text(s ? `Updated: ${JSON.stringify(s)}` : "Student not found");
    }
  );

  server.registerTool(
    "delete_student",
    { description: "Delete a student record by studentId", inputSchema: { studentId: z.string() } },
    async ({ studentId }) => {
      const s = await Student.findOneAndDelete({ studentId });
      return text(s ? `Deleted ${s.name} (${studentId})` : "Student not found");
    }
  );

  return server;
}

module.exports = (app) => {
  const path = `/mcp/${process.env.MCP_SECRET}`;

  app.post(path, async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get(path, (req, res) => res.status(405).end());
};
