const app = require("../backend/app");

const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`Smart Traffic app listening on http://${HOST}:${PORT}`);
});
