# ASC2 Flow

A highly performant, web-based ASCII software architecture diagram tool ("Vibecoding Architecture Tool"). Draw boxes, lines, arrows, and text on a crisp monospace grid, and export them as Markdown or copy them to your clipboard.

## 🌟 Features

- **Grid-Based Canvas**: Fast HTML5 `<canvas>` rendering (120x60 grid).
- **Drawing Tools**: Box (`B`), Line (`L`), Arrow (`A`), Text (`T`), Eraser (`E`).
- **Smart Intersections**: Lines and boxes automatically form `+` intersections.
- **Markdown Export**: Save your diagrams as `.md` files (`Ctrl+S`).
- **Smart Copy**: Copies only the bounding box of your drawing (`Ctrl+C`).
- **Multi-Modal AI Vision Import**: Upload a screenshot or hand-drawn sketch and convert it to ASCII!

## 🤖 AI Vision Providers Supported

ASC2 Flow supports multiple Vision AI models to convert images to ASCII. API Keys are stored securely in your browser's `localStorage`—no backend required!

- **Google Gemini** (`gemini-3.1-pro-preview`)
- **OpenAI** (`gpt-4o`)
- **Kimi 2.5** (`moonshot-v1-8k-vision-preview`)
- **MiniMax 2.5** (`minimax-vl-01`)
- **智谱 Zhipu** (`glm-4v-plus`)
- **阶跃星辰 StepFun** (`step-1v-32k`)
- **Custom**: Any OpenAI-compatible REST API.

---

## 🚀 Deployment Plan A: Web Version (Vercel)

Because ASC2 Flow manages API keys entirely in the browser, it is a **100% static frontend application**. You do NOT need to configure any environment variables on your server.

1. Push this repository to your GitHub account.
2. Go to [Vercel](https://vercel.com/) and click **Add New Project**.
3. Import your GitHub repository.
4. Vercel will automatically detect it as a Vite project.
5. Click **Deploy**.
6. Done! The `vercel.json` file handles the SPA routing automatically.

---

## 💻 Deployment Plan C: Local Desktop (macOS / Windows)

If you want to run ASC2 Flow locally as a personal tool without deploying it to the web:

### For macOS / Linux:
1. Open your terminal in this directory.
2. Make the script executable: `chmod +x start-mac-linux.sh`
3. Run the script: `./start-mac-linux.sh`
4. Open your browser to `http://localhost:3000`.

### For Windows 11:
1. Double-click the `start-windows.bat` file.
2. The script will automatically install dependencies and start the server.
3. Open your browser to `http://localhost:3000`.
