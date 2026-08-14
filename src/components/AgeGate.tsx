import React, { useState, useEffect } from 'react';

export const AgeGate = () => {
  const [isVerified, setIsVerified] = useState<boolean | null>(null);

  useEffect(() => {
    const verified = localStorage.getItem('mratina_age_verified');
    if (verified === 'true') {
      setIsVerified(true);
    } else {
      setIsVerified(false);
    }
  }, []);

  if (isVerified === null || isVerified === true) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95 backdrop-blur-md">
      <div className="max-w-md w-full bg-[#0a0a0a] border border-white/10 p-8 md:p-12 text-center shadow-2xl relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#c5a059] to-transparent opacity-50" />
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#c5a059] rounded-full blur-[100px] opacity-10" />

        <h1 className="text-3xl tracking-[0.3em] font-serif font-light text-white mb-2">MRATINA</h1>
        <p className="text-[10px] uppercase tracking-widest text-[#c5a059] mb-8">Premium Local Drinks</p>
        
        <div className="my-8">
          <h2 className="text-lg font-serif mb-4">Are you of legal drinking age?</h2>
          <p className="text-sm text-white/50 leading-relaxed">
            You must be 18 years of age or older to enter this site. By entering, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              localStorage.setItem('mratina_age_verified', 'true');
              setIsVerified(true);
            }}
            className="w-full py-4 bg-[#c5a059] text-black uppercase tracking-[0.2em] text-[10px] font-bold hover:bg-[#d4b271] transition-colors"
          >
            Yes, I am 18 or older
          </button>
          
          <button 
            onClick={() => {
              window.location.href = 'https://www.google.com';
            }}
            className="w-full py-4 bg-transparent border border-white/10 text-white uppercase tracking-[0.2em] text-[10px] hover:bg-white/5 transition-colors"
          >
            No, I am under 18
          </button>
        </div>
      </div>
    </div>
  );
};
