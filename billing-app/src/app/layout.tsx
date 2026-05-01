import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Billing System",
  description: "Minimal Billing System with Barcode Support",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="font-bold text-xl tracking-tight">BILLING<span className="text-primary">PRO</span></div>
            <div className="flex gap-6">
              <Link href="/new-bill" className="text-sm font-medium hover:text-primary transition-colors">New Bill</Link>
              <Link href="/customers" className="text-sm font-medium hover:text-primary transition-colors">Customers</Link>
            </div>
          </div>
        </nav>
        <main className="min-h-screen bg-slate-50/50">
          {children}
        </main>
      </body>
    </html>
  );
}
