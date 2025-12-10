import React from 'react'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'

function App(): React.ReactElement {
  return (
    <ErrorBoundary>
      <Layout />
    </ErrorBoundary>
  )
}

export default App
