import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const geistHeading = Geist({subsets:['latin', 'vietnamese'],variable:'--font-heading'});

const inter = Inter({subsets:['latin', 'vietnamese'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SVG — Ảnh của bạn. Dưới dạng vector.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  description: "Chuyển PNG, JPG thành SVG có thể chỉnh sửa ngay trên thiết bị. So sánh trước khi tải, không cần tài khoản.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, geistHeading.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
