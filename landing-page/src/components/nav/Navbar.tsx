'use client';
import { FaGithub } from 'react-icons/fa';
import { MdChevronRight } from 'react-icons/md';
import NavItems, { NavItemsType } from './NavItems';
import { cn } from '@/src/lib/utils';
import { useEffect, useState } from 'react';
import AppLogo from '../tickers/AppLogo';
import { Button } from '../ui/button';
import InstallModal from '../utility/InstallModal';

const GITHUB_URL = 'https://github.com/skyyycodes/nebula-wallet';

const navItems: NavItemsType[] = [
    { name: 'Features', link: '#feature' },
    { name: 'Faq', link: '#faq' },
    { name: 'About', link: '#about' },
];

export default function Navbar() {
    const [isNavbarVisible, setIsNavbarVisible] = useState<boolean>(true);
    const [lastScrollY, setLastScrollY] = useState<number>(0);
    const [openInstallModal, setOpenInstallModal] = useState(false);

    useEffect(() => {
        function handleScroll() {
            const currentScrollY = window.scrollY;

            if (currentScrollY < lastScrollY) {
                setIsNavbarVisible(true);
            } else if (currentScrollY > lastScrollY && currentScrollY > 100) {
                setIsNavbarVisible(false);
            }

            setLastScrollY(currentScrollY);
        }

        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [lastScrollY]);

    return (
        <div
            className={cn(
                'fixed w-full z-[100] flex items-center justify-between px-3 md:px-6 top-4 transition-all duration-500 ease-in-out',
                isNavbarVisible
                    ? 'translate-y-0'
                    : '-translate-y-[calc(100%+2rem)] pointer-events-none',
            )}
        >
            <AppLogo size={30} />
            <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500">
                <div
                    className={cn(
                        'py-1 px-2 rounded-[8px] flex items-center justify-center transition-all duration-500',
                    )}
                >
                    <NavItems items={navItems} />
                </div>
            </div>
            <div className="flex items-center gap-x-3">
                <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:bg-neutral-700/70 hidden md:flex items-center justify-center rounded-sm p-[6px] text-light/70 select-none cursor-pointer transition-transform hover:-translate-y-0.5"
                >
                    <FaGithub className="h-5 w-5" />
                </a>
                <Button
                    onClick={() => setOpenInstallModal(true)}
                    className={cn(
                        'text-[13px] font-semibold tracking-wide flex items-center justify-center transition-transform hover:-translate-y-0.5 cursor-pointer z-[10] pr-1 rounded-[8px]',
                        'bg-primary',
                    )}
                >
                    <span>Download</span>
                    <MdChevronRight className="text-light" />
                </Button>
            </div>
            <InstallModal open={openInstallModal} setOpen={setOpenInstallModal} />
        </div>
    );
}
