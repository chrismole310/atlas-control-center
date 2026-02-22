import "./globals.css"

export const metadata = {
  title: 'ATLAS Control Center',
  description: 'Autonomous Business Portal',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  )
}
