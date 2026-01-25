'use client';
import Image from 'next/image';
import BuilderNavbarSearchComponent from './BuilderNavbarSearchComponent';
import BuilderNavbarRightSection from './BuilderNavbarRightSection';

export default function BuilderNavbar() {
    return (
        <div className="min-h-[3.5rem] bg-darkest text-light/70 px-6 select-none relative flex items-center justify-between">
            <div className="text-[#C3C3C3] text-sm tracking-[0.5rem] flex justify-start items-center gap-x-3 cursor-pointer group">
                <Image src="/nebula_purple.png" alt="Nebula Logo" width={25} height={25} />
                NEBULA
            </div>

            <BuilderNavbarSearchComponent />
            <BuilderNavbarRightSection />
        </div>
    );
}
