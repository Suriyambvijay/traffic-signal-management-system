const express = require("express");
const path = require("path");
const healthRoutes = require("./routes/health");

const app = express();
const frontendDirectory = path.join(__dirname, "..", "frontend", "public");
const pages = new Set([
  "analytics",
  "dashboard",
  "index",
  "input",
  "login",
  "profile",
  "settings",
  "signals",
  "signup",
]);

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use("/api", healthRoutes);
app.use("/css", express.static(path.join(frontendDirectory, "css")));
app.use("/js", express.static(path.join(frontendDirectory, "js")));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendDirectory, "index.html"));
});

app.get("/:page.html", (req, res, next) => {
  if (!pages.has(req.params.page)) return next();
  res.sendFile(path.join(frontendDirectory, `${req.params.page}.html`));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

module.exports = app;