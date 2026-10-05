import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { isTheme, THEME_COOKIE, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cartograph",
  description: "A dependency map of a repository, built from really parsing it.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = isTheme(stored) ? stored : "system";

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased${
        theme === "dark" ? " dark" : ""
      }`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        {/* Before anything paints, so "follow the system" never flashes. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/dashboard"
          signUpFallbackRedirectUrl="/dashboard"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}