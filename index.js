require("dotenv").config();
const express = require("express");
const formidable = require("formidable");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const cors = require("cors");
const FormData = require("form-data");

const app = express();
const port = process.env.PORT;

// Allow all CORS requests
app.use(cors());

const WHISPER_API_URL = `${process.env.OPEN_AI_API_URL}/v1/audio/transcriptions`;
const GPT_API_URL = `${process.env.OPEN_AI_API_URL}/v1/chat/completions`;
const OPEN_AI_API_KEY = process.env.OPEN_AI_API_KEY;

// console.log(process.env);
const transcribeChunk = (chunkPath) => {
  return new Promise(async (resolve, reject) => {
    // console.log(chunkPath);
    const form = new FormData();
    form.append("file", fs.createReadStream(chunkPath));
    form.append("model", "whisper-1");
    form.append("language", "en");

    try {
      const response = await fetch(WHISPER_API_URL, {
        method: "POST",
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${OPEN_AI_API_KEY}`,
          "Content-Type": "multipart/form-data",
        },
        body: form,
      });

      if (!response.ok) {
        throw new Error("Error");
      }

      const data = await response.json();

      if (data.error) {
        throw new Error("Error");
      }
      return resolve(data.text);
    } catch (error) {
      console.error("Error during transcription:", error);
      reject(error);
    }
  });
};

const summarizeTranscription = async (transcription) => {
  return new Promise(async (resolve, reject) => {
    const prompt = `Summarize the following transcription:\n\n${transcription}\n\nSummary:`;

    try {
      const response = await fetch(GPT_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPEN_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // or any other available GPT model
          messages: [{ role: "user", content: prompt }],
          max_tokens: 150,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        throw new Error("Error");
      }

      const data = await response.json();
      return resolve(data.choices.map((el) => el.message.content).join("\n"));
    } catch (error) {
      console.error("Error during summarization:", error);
      reject(error);
    }
  });
};

app.get("/", (req, res) => res.json({ message: "Hello" }));

app.post("/upload", (req, res) => {
  const form = new formidable.IncomingForm({});

  form.parse(req, async (err, fields, files) => {
    try {
      if (err) {
        res.status(500).send("Error parsing the files");
        return;
      }

      const chunk = files.chunk[0];
      const chunkIndex = parseInt(fields.chunkIndex[0], 10);
      const totalChunks = parseInt(fields.totalChunks[0], 10);
      const fileName = fields.fileName[0];

      const tempPath = chunk.filepath;
      const newFilePath = tempPath + path.extname(fileName);

      fs.renameSync(tempPath, newFilePath);
      chunk.filepath = newFilePath;

      console.log(
        `Received chunk ${
          chunkIndex + 1
        } of ${totalChunks} for file ${fileName}`
      );

      const transcription = await transcribeChunk(chunk.filepath);

      if (chunkIndex + 1 === totalChunks) {
        console.log(`Upload complete for file ${fileName}`);
        res
          .status(200)
          .json({ message: "File upload complete", transcription });
      } else {
        res.status(200).json({
          message: `Chunk ${chunkIndex + 1} received`,
          transcription,
        });
      }
    } catch (err) {
      console.log(err);
      res.status(500).json({ message: `Server Error: ${err}` });
    }
  });
});

app.post("/summary", (req, res) => {
  try {
    const form = new formidable.IncomingForm({});
    form.parse(req, async (err, fields, files) => {
      if (err) {
        res.status(500).send("Error parsing the files");
        return;
      }

      const summary = await summarizeTranscription(fields.transcription[0]);
      res.status(200).json({ message: "File upload complete", summary });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
