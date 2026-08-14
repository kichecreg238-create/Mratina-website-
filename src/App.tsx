/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TopNavigation } from './components/Navigation.tsx';
import { CartSidebar } from './components/CartSidebar.tsx';
import { Home } from './pages/Home.tsx';
import { OrderHistory } from './pages/OrderHistory.tsx';
import { AdminDashboard } from './pages/AdminDashboard.tsx';
import { DelivererDashboard } from './pages/DelivererDashboard.tsx';
import { AgeGate } from './components/AgeGate.tsx';

export default function App() {
  return (
    <Router>
      <AgeGate />
      <div className="flex w-full h-full bg-[#050505] text-[#e0e0e0] font-sans flex-col md:flex-row overflow-hidden">
        <TopNavigation />
        
        {/* Sidebar */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-white/5 flex flex-col p-8 pt-24 bg-[#0a0a0a] shrink-0 z-20 hidden md:flex">
          <div className="mb-12 hidden md:block">
            <h1 className="text-2xl tracking-[0.3em] font-serif font-light text-white">MRATINA</h1>
            <p className="text-[10px] uppercase tracking-widest text-[#c5a059] mt-2">Premium Local Drinks</p>
          </div>
          
          <nav className="flex-1 space-y-6 hidden md:block">
            <a href="/" className="block text-xs uppercase tracking-[0.2em] text-white border-b border-[#c5a059] pb-2 w-fit">The Collection</a>
            <a href="/orders" className="block text-xs uppercase tracking-[0.2em] text-white/50 hover:text-white transition-colors">Vault Access</a>
          </nav>

          <div className="mt-auto pt-8 border-t border-white/5 hidden md:block">
            <p className="text-[10px] text-white/30 uppercase tracking-widest">Location</p>
            <p className="text-xs text-white/70 mt-1">Nairobi, KE</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 relative flex flex-col h-full overflow-hidden mt-16 md:mt-0">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/orders" element={<OrderHistory />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/deliverer" element={<DelivererDashboard />} />
          </Routes>
        </div>

        <CartSidebar />
      </div>
    </Router>
  );
}
