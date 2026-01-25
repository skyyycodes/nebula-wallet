# Nebula Demo Site

A Next.js application showcasing the Quantum Stellar Wallet with X402 micropayments and AI Agent Builder.

## Features

- **X402 Test Suite**: Complete testing environment for Stellar micropayments
- **AI Agent Builder**: Visual flow-based builder for trading agents

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
demo-site/
├── app/                    # Next.js 14 App Router
│   ├── layout.tsx         # Root layout with providers
│   ├── page.tsx           # Home page
│   ├── globals.css        # Global styles
│   ├── agent-builder/     # Agent Builder page
│   └── x402-test/         # X402 Test Suite page
├── components/            # React components
│   ├── agent-builder/    # Agent builder components
│   └── providers/        # Context providers
├── lib/                   # Utility functions
├── types/                 # TypeScript types
└── public/               # Static assets
```

## Technologies

- Next.js 14 (App Router)
- React 18
- TypeScript
- Tailwind CSS
- Stellar SDK

## License

MIT
