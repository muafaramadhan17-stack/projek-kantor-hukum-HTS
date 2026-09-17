import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-bg/95 backdrop-blur-md border-b border-border">
      <nav className="container mx-auto px-4 h-20 flex items-center justify-between">
        <a href="#beranda" className="flex items-center gap-3">
          <img src="/assets/hts_logo_svg.svg" alt="Logo" className="w-10 h-10 rounded border border-border bg-surface p-0.5" />
          <div className="flex flex-col">
            <span className="text-navy font-bold text-lg leading-none tracking-tight">HTS & Partners</span>
            <span className="text-emerald text-[10px] font-medium tracking-wide">Pengacara & Konsultan Hukum</span>
          </div>
        </a>

        <div className="hidden lg:flex items-center gap-6">
          {['Beranda', 'Layanan', 'Tentang', 'Kontak'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} className="text-navy-light hover:text-white font-medium text-sm transition-colors">
              {item}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          <button onClick={() => (window as any).bukaPortalKlien()} className="text-emerald border border-emerald bg-emerald/10 px-4 py-2 rounded-md font-semibold text-xs hover:bg-emerald hover:text-bg transition-colors">
            Cek Status
          </button>
          <button onClick={() => (window as any).bukaPortalAdvokat()} className="text-gold border border-gold bg-gold/10 px-4 py-2 rounded-md font-semibold text-xs hover:bg-gold hover:text-bg transition-colors">
            Login Admin
          </button>
          <a href="https://wa.me/6287773115795" target="_blank" rel="noopener noreferrer" className="bg-emerald text-white px-4 py-2 rounded-md font-semibold text-xs hover:bg-emerald/90 transition-colors">
            WhatsApp
          </a>
        </div>

        <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden text-white p-2">
          <div className="relative w-6 h-6 flex items-center justify-center">
            <span className={`absolute w-6 h-0.5 bg-white transform transition-all duration-300 ${isOpen ? 'rotate-45' : '-translate-y-2'}`} />
            <span className={`absolute w-6 h-0.5 bg-white transform transition-all duration-300 ${isOpen ? 'opacity-0' : ''}`} />
            <span className={`absolute w-6 h-0.5 bg-white transform transition-all duration-300 ${isOpen ? '-rotate-45' : 'translate-y-2'}`} />
          </div>
        </button>
      </nav>

      <div className={`lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setIsOpen(false)} />
      <div className={`lg:hidden fixed top-20 left-0 right-0 z-40 bg-surface/80 backdrop-blur-xl border-b border-border p-4 flex flex-col gap-3 transform transition-transform duration-300 ease-out ${isOpen ? 'translate-y-0' : '-translate-y-full'}`}>
        {['Beranda', 'Layanan', 'Tentang', 'Kontak'].map(item => (
          <a key={item} href={`#${item.toLowerCase()}`} className="text-white py-2" onClick={() => setIsOpen(false)}>{item}</a>
        ))}
      </div>
    </header>
  );
};
