import { useCallback, useEffect, useState } from 'react'
import { useSession } from './authClient'
import { BrandPaintLoader } from './BrandPaintLoader'
import { Editor } from './Editor'
import { Login } from './Login'
import { RoomPicker } from './RoomPicker'

function currentRoomSlug(pathname: string): string | null {
	const match = pathname.match(/^\/r\/([a-zA-Z0-9_-]{1,64})$/)
	return match ? match[1] : null
}

function App() {
	const { data: session, isPending } = useSession()
	const [path, setPath] = useState(window.location.pathname)
	const [splashDone, setSplashDone] = useState(false)

	useEffect(() => {
		const onPop = () => setPath(window.location.pathname)
		window.addEventListener('popstate', onPop)
		return () => window.removeEventListener('popstate', onPop)
	}, [])

	const navigate = useCallback((to: string) => {
		window.history.pushState({}, '', to)
		setPath(to)
	}, [])

	const openRoom = useCallback((slug: string) => navigate(`/r/${slug}`), [navigate])
	const finishSplash = useCallback(() => setSplashDone(true), [])

	if (!splashDone) {
		return <BrandPaintLoader pending={isPending} onDone={finishSplash} />
	}

	if (!session) {
		return <Login />
	}

	const roomSlug = currentRoomSlug(path)
	if (roomSlug) {
		return <Editor roomId={roomSlug} />
	}

	return <RoomPicker onOpenRoom={openRoom} />
}

export default App
