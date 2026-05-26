# Chat with AI - Local Setup Guide

This project is a full-stack AI application using React, Vite, Express, and Firebase.

## How to run in VS Code

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a file named `.env` in the root folder and add:
   ```env
   GEMINI_API_KEY=your_key_here
   STRIPE_SECRET_KEY=your_key_here
   ```

3. **Run the Live Server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Features
- **Mobile First**: Full-screen experience on mobile devices.
- **Ultra Premium**: Enhanced AI capabilities with high-fidelity reasoning.
- **Secure**: Authentication via Google/Firebase.
- **Persistent**: Chat history saved securely.

## Scripts
- `npm run dev`: Starts the development server with Hot Module Replacement.
- `npm run build`: Builds the app for production.
- `npm run start`: Starts the production server.
