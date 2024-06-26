import express from 'express'
import {
    setupDirectories,
    downloadRawVideo,
    convertVideo,
    uploadProcessedVideo,
    deleteRawVideo,
    deleteProcessedVideo

} from './storage'
import { isVideoNew, setVideo } from './firestore'

setupDirectories()

const app = express()
app.use(express.json())

app.post('/process-video', async (req, res) => {

    let data

    try {
        // Convert pub/sub message (base64-encoded format) to utf-8
        const message = Buffer.from(req.body.message.data, 'base64').toString('utf8')

        data = JSON.parse(message)
        if (!data.name) {
            throw new Error('Invalid message payload received.')
        }
    } catch (error) {
        console.error(error)
        return res.status(400).send('Bad Request: missing filename.')
    }

    const inputFileName = data.name // In format of <UID>-<DATE>.<EXTENSION>
    const outputFileName = `processed-${inputFileName}`
    const videoId = inputFileName.split('.')[0]

    if (!isVideoNew(videoId)) {
        return res.status(400).send('Bad Request: video already processing or processed.')
    } else {
        await setVideo(videoId, {
            id: videoId,
            uid: videoId.split('-')[0],
            status: 'processing'
        })
    }

    // Download the raw video from Cloud Storage
    await downloadRawVideo(inputFileName)

    // Process the video into 360p
    try {
        await convertVideo(inputFileName, outputFileName)
    } catch (err) {
        await Promise.all(
            [
                deleteRawVideo(inputFileName),
                deleteProcessedVideo(outputFileName)
            ]
        )
        return res.status(500).send('Processing failed')
    }

    // Upload the processed video to Cloud Storage
    await uploadProcessedVideo(outputFileName)

    await setVideo(videoId, {
        status: 'processed',
        filename: outputFileName
    })

    await Promise.all(
        [
            deleteRawVideo(inputFileName),
            deleteProcessedVideo(outputFileName)
        ]
    )

    return res.status(200).send('Processing finished successfully')
})

const port = process.env.PORT || 8080
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
})
