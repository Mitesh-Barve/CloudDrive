const express = require('express');
const authMiddleware = require('../middlewares/authe')
const supabase = require('../config/supabase.config')

const router = express.Router();
const upload = require('../config/multer.config')
const fileModel = require('../models/files.models')


router.get('/home', authMiddleware, async (req, res) => {
    try {
        const { filter } = req.query;
        let query = { user: req.user.userId };
        let sort = { createdAt: -1 };

        if (filter === 'favorites') {
            query.isFavorite = true;
        } else if (filter === 'recent') {
            // Recent is just sorted by createdAt, handled by default sort here
        }

        const userFiles = await fileModel.find(query).sort(sort);

        res.render('home', {
            files: userFiles,
            filter: filter || 'all'
        });

    } catch (err) {
        console.log(err)
        res.status(500).json({ message: 'Server Error' })
    }
})

router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {

    try {
        const file = req.file;

        if (!file) {
            return res.redirect('/home');
        }

        const fileName = `${Date.now()}-${file.originalname}`;

        const { data, error } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .upload(fileName, file.buffer, {
                contentType: file.mimetype,
                upsert: false
            });

        if (error) {
            throw error;
        }

        const newFile = await fileModel.create({
            path: fileName,
            originalname: file.originalname,
            user: req.user.userId
        })

        // Redirect back to home after successful upload
        res.redirect('/home')

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Upload Failed: ' + err.message });
    }

})


router.get('/download/:path', authMiddleware, async (req, res) => {

    try {
        const loggedInUserId = req.user.userId;
        const path = req.params.path;

        const file = await fileModel.findOne({
            user: loggedInUserId,
            path: path
        })

        if (!file) {
            return res.status(401).json({
                message: 'Unauthorized'
            })
        }

        const { data, error } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .createSignedUrl(path, 60);

        if (error) {
            throw error;
        }

        res.redirect(data.signedUrl)

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Download Failed' });
    }

})


// Delete file route
router.post('/delete/:path', authMiddleware, async (req, res) => {

    try {
        const loggedInUserId = req.user.userId;
        const path = req.params.path;

        const file = await fileModel.findOne({
            user: loggedInUserId,
            path: path
        })

        if (!file) {
            return res.status(401).json({
                message: 'Unauthorized'
            })
        }

        // Delete from Supabase storage
        const { error } = await supabase.storage
            .from(process.env.SUPABASE_BUCKET)
            .remove([path]);

        if (error) {
            console.error('Supabase delete error:', error);
        }

        // Delete from database
        await fileModel.deleteOne({ _id: file._id });

        res.redirect('/home')

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Delete Failed' });
    }

})


// Toggle favorite route
router.post('/favorite/:id', authMiddleware, async (req, res) => {
    try {
        const fileId = req.params.id;
        const file = await fileModel.findOne({
            _id: fileId,
            user: req.user.userId
        });

        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        file.isFavorite = !file.isFavorite;
        await file.save();

        res.json({ success: true, isFavorite: file.isFavorite });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to toggle favorite' });
    }
})


// Logout route
router.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/user/login');
})


module.exports = router;