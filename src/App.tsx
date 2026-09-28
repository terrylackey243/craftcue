import { lazy, useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSetup } from './hooks'
import { firstRunInit } from './lib/storage'
import { initAccount } from './lib/cloud/account'
import { useAccount } from './hooks'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import Wizard from './screens/Wizard'
import Home from './screens/Home'
import Inventory from './screens/Inventory'
import AddSupply from './screens/AddSupply'
import SupplyEdit from './screens/SupplyEdit'
import Projects from './screens/Projects'
import ProjectDetail from './screens/ProjectDetail'
import Shopping from './screens/Shopping'
import People from './screens/People'
import Settings from './screens/Settings'
import Help from './screens/Help'
import KeyGuide from './screens/KeyGuide'

// Screens that pull in the AI SDK or the barcode scanner load on demand, keeping first paint small.
const ScanBarcode = lazy(() => import('./screens/ScanBarcode'))
const PhotoAdd = lazy(() => import('./screens/PhotoAdd'))
const BulkAdd = lazy(() => import('./screens/BulkAdd'))
const Suggest = lazy(() => import('./screens/Suggest'))

// HashRouter so the app works from any static host (GitHub Pages subpath, nginx, file server)
// without server-side rewrite rules.
export default function App() {
  const setup = useSetup()
  const [justCompleted, setJustCompleted] = useState(false)

  const account = useAccount()

  useEffect(() => {
    void firstRunInit()
    void initAccount()
  }, [])

  useEffect(() => {
    if (setup) document.documentElement.style.setProperty('--cc-font-scale', String(setup.fontScale || 1))
  }, [setup])

  if (!setup || !account.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Opening CraftCue…" />
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/setup/*" element={<Wizard onComplete={() => setJustCompleted(true)} />} />
        {!setup.setupComplete && !justCompleted ? (
          <Route path="*" element={<Navigate to="/setup" replace />} />
        ) : (
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="add" element={<AddSupply />} />
            <Route path="add/manual" element={<SupplyEdit />} />
            <Route path="add/scan" element={<ScanBarcode />} />
            <Route path="add/photo" element={<PhotoAdd />} />
            <Route path="add/bulk" element={<BulkAdd />} />
            <Route path="supply/:id" element={<SupplyEdit />} />
            <Route path="suggest/:goal" element={<Suggest />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="shopping" element={<Shopping />} />
            <Route path="people" element={<People />} />
            <Route path="settings" element={<Settings />} />
            <Route path="help" element={<Help />} />
            <Route path="help/ai-key" element={<KeyGuide />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
      </Routes>
    </HashRouter>
  )
}
