import { useSync } from '@tldraw/sync'
import {
	AssetRecordType,
	getHashForString,
	TLAssetStore,
	TLBookmarkAsset,
	Tldraw,
	uniqueId,
} from 'tldraw'

const LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined

function wsUri(roomId: string): string {
	const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
	return `${proto}://${window.location.host}/connect/${encodeURIComponent(roomId)}`
}

// Assets are proxied through our own (authenticated) server. Cookies are sent
// automatically for same-origin requests.
const multiplayerAssets: TLAssetStore = {
	async upload(_asset, file) {
		const id = uniqueId()
		const objectName = `${id}-${file.name}`.replace(/[^a-zA-Z0-9.-]/g, '-')
		const url = `/uploads/${encodeURIComponent(objectName)}`

		const response = await fetch(url, {
			method: 'PUT',
			body: file,
			headers: file.type ? { 'Content-Type': file.type } : undefined,
		})
		if (!response.ok) {
			throw new Error(`Failed to upload asset: ${response.statusText}`)
		}
		return { src: url }
	},
	resolve(asset) {
		return asset.props.src
	},
}

async function unfurlBookmarkUrl({ url }: { url: string }): Promise<TLBookmarkAsset> {
	const asset: TLBookmarkAsset = {
		id: AssetRecordType.createId(getHashForString(url)),
		typeName: 'asset',
		type: 'bookmark',
		meta: {},
		props: { src: url, description: '', image: '', favicon: '', title: '' },
	}
	try {
		const response = await fetch(`/unfurl?url=${encodeURIComponent(url)}`)
		const data = await response.json()
		asset.props.description = data?.description ?? ''
		asset.props.image = data?.image ?? ''
		asset.props.favicon = data?.favicon ?? ''
		asset.props.title = data?.title ?? ''
	} catch (e) {
		console.error(e)
	}
	return asset
}

export function Editor({ roomId }: { roomId: string }) {
	const store = useSync({
		uri: wsUri(roomId),
		assets: multiplayerAssets,
	})

	return (
		<div style={{ position: 'fixed', inset: 0 }}>
			<Tldraw
				store={store}
				licenseKey={LICENSE_KEY}
				onMount={(editor) => {
					;(window as any).editor = editor
					editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
				}}
			/>
		</div>
	)
}
