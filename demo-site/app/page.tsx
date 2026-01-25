import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f0f1e]">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold mb-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] bg-clip-text text-transparent">
            ⚡ Nebula Demo Suite
          </h1>
          <p className="text-xl text-gray-400">
            Quantum Stellar Wallet - X402 Micropayments & AI Agent Builder
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* X402 Test Suite Card */}
          <Link href="/x402-test" className="group">
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-[#667eea]/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#667eea]/20">
              <div className="text-5xl mb-4">💳</div>
              <h2 className="text-2xl font-bold mb-3 text-white">X402 Test Suite</h2>
              <p className="text-gray-400 mb-4">
                Complete testing for X402 Stellar micropayments with wallet integration and balance verification
              </p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>✓ Extension Status Check</li>
                <li>✓ Wallet Connection</li>
                <li>✓ Spending Account Management</li>
                <li>✓ Payment Execution</li>
                <li>✓ Balance Verification</li>
                <li>✓ Debug Tools</li>
              </ul>
              <div className="mt-6 inline-flex items-center text-[#667eea] group-hover:text-[#764ba2] font-semibold">
                Launch Test Suite
                <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>

          {/* Agent Builder Card */}
          <Link href="/agent-builder" className="group">
            <div className="h-full bg-white/5 border border-white/10 rounded-2xl p-8 hover:bg-white/10 hover:border-[#667eea]/50 transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-[#667eea]/20">
              <div className="text-5xl mb-4">🤖</div>
              <h2 className="text-2xl font-bold mb-3 text-white">AI Agent Builder</h2>
              <p className="text-gray-400 mb-4">
                Visual flow-based builder for creating custom trading agents with AI assistance
              </p>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>✓ Visual Flow Canvas</li>
                <li>✓ Block-based Logic</li>
                <li>✓ AI Chat Assistant</li>
                <li>✓ Agent Management</li>
                <li>✓ Export & Import</li>
                <li>✓ Real-time Preview</li>
              </ul>
              <div className="mt-6 inline-flex items-center text-[#667eea] group-hover:text-[#764ba2] font-semibold">
                Open Agent Builder
                <svg className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-16 text-center">
          <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
            <span>Built with</span>
            <span className="text-[#667eea]">Next.js</span>
            <span>•</span>
            <span className="text-[#667eea]">Stellar</span>
            <span>•</span>
            <span className="text-[#667eea]">Quantum Security</span>
          </div>
        </div>
      </div>
    </div>
  );
}
