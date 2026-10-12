const app = require("../backend/app");

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";

app.listen(port, host, () => {
  console.log(`Smart Traffic app listening at http://${host}:${port}`);
});