import React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        useragent?: string
        allowpopups?: string | boolean
        nodeintegration?: string | boolean
        partition?: string
      }
    }
  }
}
