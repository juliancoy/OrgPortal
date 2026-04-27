import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import './ImageEditorModal.css'

type ImageEditorModalProps = {
  image: string
  onClose: () => void
  onSave: (base64Image: string) => void
}

export function ImageEditorModal(props: ImageEditorModalProps) {
  const { image, onClose, onSave } = props
  const [localImage, setLocalImage] = useState(image)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropComplete = (_croppedArea: Area, nextCroppedAreaPixels: Area) => {
    setCroppedAreaPixels(nextCroppedAreaPixels)
  }

  const handleSave = async () => {
    if (!croppedAreaPixels) return
    try {
      const croppedImage = await getCroppedImg(localImage, croppedAreaPixels, rotation)
      const base64Data = croppedImage.split(',')[1]
      onSave(base64Data)
    } catch (err) {
      console.error('Error cropping image:', err)
    }
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLocalImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLocalImage(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }, [])

  return (
    <div
      className="portal-image-editor-overlay"
      onDrop={handleDrop}
      onDragOver={(event) => event.preventDefault()}
      onClick={onClose}
    >
      <div className="portal-image-editor-content" onClick={(event) => event.stopPropagation()}>
        <div className="portal-image-upload-zone">
          <label htmlFor="portalImageUpload" className="portal-image-upload-label">
            Click or drag an image here to upload
            <input
              id="portalImageUpload"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        {localImage ? (
          <div className="portal-image-crop-container">
            <Cropper
              image={localImage}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
            />
          </div>
        ) : null}
        <div className="portal-image-editor-controls">
          <div className="portal-image-slider">
            <label>Zoom</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </div>
          <div className="portal-image-slider">
            <label>Rotation</label>
            <input
              type="range"
              min={0}
              max={360}
              value={rotation}
              onChange={(event) => setRotation(Number(event.target.value))}
            />
          </div>
          <div className="portal-image-editor-actions">
            <button type="button" className="portal-image-btn subtle" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="portal-image-btn primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

async function getCroppedImg(imageSrc: string, pixelCrop: Area, rotation = 0): Promise<string> {
  const image = new Image()
  image.src = imageSrc

  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = reject
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  const maxSize = Math.max(image.width, image.height)
  const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2))

  canvas.width = safeArea
  canvas.height = safeArea
  ctx.clearRect(0, 0, safeArea, safeArea)
  ctx.translate(safeArea / 2, safeArea / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.translate(-safeArea / 2, -safeArea / 2)
  ctx.drawImage(image, safeArea / 2 - image.width / 2, safeArea / 2 - image.height / 2)

  const data = ctx.getImageData(0, 0, safeArea, safeArea)

  const croppedCanvas = document.createElement('canvas')
  croppedCanvas.width = pixelCrop.width
  croppedCanvas.height = pixelCrop.height
  const croppedCtx = croppedCanvas.getContext('2d')
  if (!croppedCtx) {
    throw new Error('Could not create cropped canvas context')
  }

  croppedCtx.clearRect(0, 0, pixelCrop.width, pixelCrop.height)
  croppedCtx.putImageData(
    data,
    Math.round(0 - safeArea / 2 + image.width / 2 - pixelCrop.x),
    Math.round(0 - safeArea / 2 + image.height / 2 - pixelCrop.y),
  )

  const finalCanvas = document.createElement('canvas')
  finalCanvas.width = 512
  finalCanvas.height = 512
  const finalCtx = finalCanvas.getContext('2d')
  if (!finalCtx) {
    throw new Error('Could not create final canvas context')
  }
  finalCtx.clearRect(0, 0, 512, 512)
  finalCtx.drawImage(croppedCanvas, 0, 0, 512, 512)

  return finalCanvas.toDataURL('image/png')
}
