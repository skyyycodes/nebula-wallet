import { motion } from 'framer-motion';
import { cn } from '@/src/lib/utils';
import { doto } from './FeatureOne';
import Image from 'next/image';

export default function Footer() {
    return (
        <motion.div className="min-w-screen h-screen bg-[#0a0b0d] relative">
            <div className="h-full py-12 md:py-0 text-neutral-200 w-full flex flex-col justify-center items-center">
                <div className="md:text-[10rem] text-4xl font-black tracking-wider flex items-center md:flex-row">
                    <span className={cn(doto.className)}>NEBULA</span>
                    <Image
                        src="/nebula_purple.png"
                        alt="Nebula Logo"
                        width={208}
                        height={208}
                        className="md:h-52 md:w-52 h-12 w-12 transition-all duration-500"
                    />
                </div>
                <p className="text-neutral-500 md:text-sm text-xs tracking-wider mt-4 text-center px-4">
                    © 2025 Nebula. Powered by XMSS + Stellar.
                </p>
            </div>
        </motion.div>
    );
}
