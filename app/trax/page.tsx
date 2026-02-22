"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface CapitalData {
  total: number
  available: number
  deployed: number
  currency: string
}

export default function TraxPage() {
  const [capital, setCapital] = useState<CapitalData | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const fetchCapital = async () => {
      try {
        const res = await fetch("http://localhost:8000/api/v1/trax/capital")
        const data = await res.json()
        setCapital(data)
        setConnected(true)
      } catch (err) {
        setConnected(false)
      }
    }

    fetchCapital()
    const interval = setInterval(fetchCapital, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatMoney = (amount: number | undefined) => {
    if (amount === undefined) return "..."
    return `$${amount.toLocaleString()}`
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">TRAX Autonomous CFO</h1>
        <Badge variant={connected ? "default" : "destructive"}>
          {connected ? "Connected" : "Disconnected"}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Capital</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatMoney(capital?.total)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              {formatMoney(capital?.available)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">
              {formatMoney(capital?.deployed)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
