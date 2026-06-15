import { BrowserRouter, Routes, Route } from 'react-router-dom'

function HomePage() {
  return <div className="p-8"><h1 className="text-2xl font-bold">AutoRuner4Test</h1></div>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  )
}
