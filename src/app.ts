
import express from "express";
import { errorHandler } from "./middleware/error-handler.js";
import { slotRouter } from "./routes/slot.routes.js";

export const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
  });
});


app.use("/api/v1/slots", slotRouter);

app.use(errorHandler);
