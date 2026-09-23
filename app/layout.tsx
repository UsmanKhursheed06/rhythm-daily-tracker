import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Rhythm — Your daily tracker',description:'Find your rhythm with a color-coded weekly schedule, daily tasks, habits and focused time.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg',apple:'/icon-192.png'},appleWebApp:{capable:true,statusBarStyle:'default',title:'Rhythm'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><head><meta name="theme-color" content="#172e27"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/></head><body>{children}</body></html>}
