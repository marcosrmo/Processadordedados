import { Card, CardContent } from "../components/ui/card"; // Caminho relativo direto
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Did you discover a secret place, or has a link gone broken?
          </p>
          <Link href="/">
            <a className="text-blue-500 hover:text-blue-600 font-medium mt-4 block">
              Return to Dashboard
            </a>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
