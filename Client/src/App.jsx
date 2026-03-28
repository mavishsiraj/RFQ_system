import { Routes, Route, Link, useLocation } from "react-router-dom";
import { Gavel, PlusCircle, List } from "lucide-react";
import AuctionList from "./pages/AuctionList";
import AuctionDetail from "./pages/AuctionDetail";
import CreateRfq from "./pages/CreateRfq";

export default function App() {
  const loc = useLocation();

  const navLinks = [
    { to: "/", label: "Auctions", icon: List },
    { to: "/create", label: "Create RFQ", icon: PlusCircle },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 text-brand-700 font-bold text-lg">
            <Gavel className="w-6 h-6" />
            <span>British Auction RFQ</span>
          </Link>
          <nav className="flex items-center gap-1">
            {navLinks.map((l) => {
              const Icon = l.icon;
              const active = loc.pathname === l.to;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {l.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Routes>
          <Route path="/" element={<AuctionList />} />
          <Route path="/create" element={<CreateRfq />} />
          <Route path="/rfq/:id" element={<AuctionDetail />} />
        </Routes>
      </main>

      <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        British Auction RFQ System
      </footer>
    </div>
  );
}
