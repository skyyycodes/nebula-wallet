import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
    title: 'Nebula Wallet',
    description:
        'Nebula is a quantum-safe Stellar wallet powered by XMSS signatures and post-quantum security.',
    metadataBase: new URL('https://nebula.dev'),
    openGraph: {
        title: 'Nebula Wallet',
        description:
            'Nebula is a quantum-safe Stellar wallet powered by XMSS signatures and post-quantum security.',
        url: 'https://nebula.dev',
        siteName: 'Nebula Wallet',
        images: [
            {
                url: '/images/nebula-dashboard.png',
                width: 1200,
                height: 630,
                alt: 'Nebula Wallet Preview',
            },
        ],
        type: 'website',
    },
    twitter: {
        card: 'summary_large_image',
        title: 'Nebula Wallet | Quantum-Safe Stellar Wallet',
        description:
            'Nebula is a quantum-safe Stellar wallet powered by XMSS signatures and post-quantum security.',
        images: ['/images/nebula-dashboard.png'],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`antialiased bg-darkest`} suppressHydrationWarning>
                <Toaster
                    theme="dark"
                    closeButton
                    visibleToasts={4}
                    toastOptions={{
                        style: {
                            background: '#121314',
                            color: '#ababab',
                            border: '1px solid #2C2C2E',
                            borderRadius: '12px',
                            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                        },
                        classNames: {
                            title: 'text-white font-semibold',
                            description: 'text-gray-300',
                            actionButton: 'bg-indigo-600 text-white hover:bg-indigo-700',
                            cancelButton: 'bg-[#121314] text-light/70 hover:bg-gray-800',
                        },
                    }}
                />
                {children}
            </body>
        </html>
    );
}
