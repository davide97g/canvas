import { useSync } from '@tldraw/sync'
import {
	AssetRecordType,
	DefaultMainMenu,
	DefaultMainMenuContent,
	Editor as TldrawEditor,
	getHashForString,
	putExcalidrawContent,
	TLAssetStore,
	TLBookmarkAsset,
	TLComponents,
	Tldraw,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	TLUiToastsContextType,
	uniqueId,
	useEditor,
	useToasts,
} from 'tldraw'

const LICENSE_KEY = import.meta.env.VITE_TLDRAW_LICENSE_KEY as string | undefined

function wsUri(roomId: string): string {
	const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
	return `${proto}://${window.location.host}/connect/${encodeURIComponent(roomId)}`
}

const MAX_UPLOAD_ATTEMPTS = 5

// Bulk pastes/imports upload many assets at once and can trip the server's
// rate limit; honor Retry-After on 429 instead of dropping the image.
async function uploadWithRetry(url: string, file: File): Promise<Response> {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(url, {
			method: 'PUT',
			body: file,
			headers: file.type ? { 'Content-Type': file.type } : undefined,
		})
		if (response.status !== 429 || attempt >= MAX_UPLOAD_ATTEMPTS) return response
		const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt
		await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000))
	}
}

// Assets are proxied through our own (authenticated) server. Cookies are sent
// automatically for same-origin requests.
const multiplayerAssets: TLAssetStore = {
	async upload(_asset, file) {
		const id = uniqueId()
		const objectName = `${id}-${file.name}`.replace(/[^a-zA-Z0-9.-]/g, '-')
		const url = `/uploads/${encodeURIComponent(objectName)}`

		const response = await uploadWithRetry(url, file)
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

// tldraw's putExcalidrawContent maps strokeWidth via a lookup that only knows
// 1/2/3/4 and (for freedraw) has no fallback, so any other width produces
// `size: undefined` and a store ValidationError. Snap widths to the nearest
// known value before conversion.
function normalizeExcalidrawContent<T extends { elements?: any[] }>(content: T): T {
	if (!Array.isArray(content.elements)) return content
	return {
		...content,
		elements: content.elements.map((el: any) => {
			const width = typeof el?.strokeWidth === 'number' ? el.strokeWidth : 1
			return { ...el, strokeWidth: Math.min(4, Math.max(1, Math.round(width))) }
		}),
	}
}

function pickExcalidrawFile(): Promise<File | null> {
	return new Promise((resolve) => {
		const input = document.createElement('input')
		input.type = 'file'
		input.accept = '.excalidraw,application/json,.json'
		input.onchange = () => resolve(input.files?.[0] ?? null)
		input.oncancel = () => resolve(null)
		input.click()
	})
}

async function importExcalidraw(editor: TldrawEditor, toasts: TLUiToastsContextType) {
	const file = await pickExcalidrawFile()
	if (!file) return
	try {
		const data = JSON.parse(await file.text())
		if (data?.type !== 'excalidraw' || !Array.isArray(data.elements)) {
			throw new Error('Not an Excalidraw file')
		}
		const elements = data.elements.filter((el: any) => !el.isDeleted)
		await putExcalidrawContent(
			editor,
			normalizeExcalidrawContent({
				type: 'excalidraw/clipboard',
				elements,
				files: data.files ?? {},
			}),
			editor.getViewportPageBounds().center
		)
		editor.zoomToSelection({ animation: { duration: 220 } })
		toasts.addToast({
			title: 'Imported from Excalidraw',
			description: `${elements.length} element${elements.length === 1 ? '' : 's'} added.`,
			severity: 'success',
		})
	} catch (err) {
		console.error(err)
		toasts.addToast({
			title: 'Import failed',
			description: 'The selected file is not a valid .excalidraw file.',
			severity: 'error',
		})
	}
}

function CustomMainMenu() {
	const editor = useEditor()
	const toasts = useToasts()
	return (
		<DefaultMainMenu>
			<DefaultMainMenuContent />
			<TldrawUiMenuGroup id="excalidraw">
				<TldrawUiMenuItem
					id="import-excalidraw"
					label="Import from Excalidraw"
					readonlyOk={false}
					onSelect={() => void importExcalidraw(editor, toasts)}
				/>
			</TldrawUiMenuGroup>
		</DefaultMainMenu>
	)
}

const components: TLComponents = {
	MainMenu: CustomMainMenu,
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
				components={components}
				onMount={(editor) => {
					;(window as any).editor = editor
					editor.registerExternalAssetHandler('url', unfurlBookmarkUrl)
					// Override the default paste handler so pasted Excalidraw
					// content gets the same strokeWidth normalization as imports.
					editor.registerExternalContentHandler('excalidraw', async ({ point, content }) => {
						editor.run(() => {
							putExcalidrawContent(editor, normalizeExcalidrawContent(content), point)
						})
					})
				}}
			/>
		</div>
	)
}
