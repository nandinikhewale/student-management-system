// MCP server: lets Claude / Antigravity manage students and backend container copies
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

  server.registerTool(
    "copy_student",
    {
      description: "Create a copy or duplicate of an existing student record or container by studentId",
      inputSchema: {
        sourceStudentId: z.string().describe("The studentId of the student to copy from"),
        newStudentId: z.string().describe("The new unique studentId for the copy"),
        name: z.string().optional().describe("Optional new name for the copy (defaults to '[Original Name] (Copy)')"),
        email: z.string().optional().describe("Optional new email for the copy"),
      },
    },
    async ({ sourceStudentId, newStudentId, name, email }) => {
      const original = await Student.findOne({ studentId: sourceStudentId });
      if (!original) return text(`Source student ${sourceStudentId} not found`);

      const copyData = {
        studentId: newStudentId,
        name: name || `${original.name} (Copy)`,
        email: email || `copy_${Date.now()}_${original.email}`,
        department: original.department,
        semester: original.semester,
        contact: original.contact,
      };
      const created = await Student.create(copyData);
      return text(`Created copy of student ${original.name}: ID ${created.studentId}`);
    }
  );

  server.registerTool(
    "copy_container",
    {
      description: "Create a copy or replica configuration of the backend container (student-api)",
      inputSchema: {
        replicaName: z.string().optional().describe("Name of the container copy, default: 'student-api-copy'"),
        port: z.number().optional().describe("Port for the container copy, default: 5001"),
      },
    },
    async ({ replicaName = "student-api-copy", port = 5001 }) => {
      return text(
        JSON.stringify(
          {
            status: "ready",
            message: `Copy container '${replicaName}' configured to run on port ${port}`,
            dockerCommand: `docker run -d --name ${replicaName} -p ${port}:5000 --env-file .env student-management-backend`,
            dockerComposeService: `docker compose up -d ${replicaName}`,
            renderBlueprint: `A copy service '${replicaName}' is configured in render.yaml ready to deploy on Render.`,
          },
          null,
          2
        )
      );
    }
  );

  server.registerTool(
    "deploy_render_copy",
    {
      description: "Deploy a live copy container of student-api directly to Render via the Render API",
      inputSchema: {
        apiKey: z.string().describe("Render API Key (from https://dashboard.render.com/u/settings#api-keys)"),
        serviceName: z.string().optional().describe("Name of the copy container, default: 'student-api-copy'"),
        region: z.string().optional().describe("Render region, default: 'oregon'"),
      },
    },
    async ({ apiKey, serviceName = "student-api-copy", region = "oregon" }) => {
      try {
        const headers = {
          Authorization: `Bearer ${apiKey.trim()}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        };

        const ownersRes = await fetch("https://api.render.com/v1/owners", { headers });
        if (!ownersRes.ok) {
          const err = await ownersRes.text();
          return text(`Authentication error with Render API: ${err}`);
        }
        const owners = await ownersRes.json();
        const ownerId = owners[0]?.owner?.id || owners[0]?.id;
        if (!ownerId) return text("No Render workspace/owner found for this account.");

        const payload = {
          type: "web_service",
          name: serviceName,
          ownerId,
          repo: "https://github.com/nandinikhewale/student-management-system",
          branch: "main",
          rootDir: "backend",
          autoDeploy: "yes",
          envVars: [
            { key: "PORT", value: "5000" },
            { key: "MONGODB_URI", value: process.env.MONGODB_URI || "mongodb+srv://studentuser:MCPproject1@cluster0.zppnopw.mongodb.net/studentDB?retryWrites=true&w=majority" },
            { key: "FRONTEND_URL", value: process.env.FRONTEND_URL || "https://student-management-system-frontend-nu-navy.vercel.app" },
            { key: "MCP_SECRET", value: process.env.MCP_SECRET || "MCP_project_1_key" },
          ],
          serviceDetails: {
            env: "node",
            plan: "free",
            region,
            buildCommand: "npm install",
            startCommand: "node server.js",
          },
        };

        const createRes = await fetch("https://api.render.com/v1/services", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });

        const data = await createRes.json();
        if (!createRes.ok) {
          return text(`Render API returned ${createRes.status}: ${JSON.stringify(data, null, 2)}`);
        }

        return text(
          JSON.stringify(
            {
              status: "success",
              message: `Created live container '${serviceName}' on Render successfully!`,
              id: data.id,
              serviceUrl: data.serviceDetails?.url || `https://${data.slug}.onrender.com`,
              dashboardUrl: `https://dashboard.render.com/web/${data.id}`,
            },
            null,
            2
          )
        );
      } catch (err) {
        return text(`Deployment failed: ${err.message}`);
      }
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
