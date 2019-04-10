const express = require('express');
const app = express();
const child = require('child_process');
const fs = require('fs');
const os = require('os');
const Path = require('path');
const { promisify } = require('util');


const exec = promisify(child.exec);
const exists = promisify(fs.exists);
const mkdir = promisify(fs.mkdir);

const preProjectDir = Path.join(__dirname, 'pre-projects');
const prodProjectDir = Path.join(__dirname, 'prod-projects');

app.use(express.json());

app.post('/payload', async (req, res) => {
    try {
        const { action, repository, release } = req.body;
        if (action !== 'published') {
            return res.json({ message: 'do not thing' });
        }
        const basePath = release.prerelease ? preProjectDir : prodProjectDir;
        const projectPath = Path.join(basePath, repository.name);
        if (!(await exists(basePath))) {
            await mkdir(basePath, { recursive: true });
        }

        if (!(await exists(projectPath))) {
            await exec(`git clone ${repository.ssh_url} ${repository.name}`, { cwd: basePath });
        } else {
            await exec('git fetch --all', { cwd: projectPath });
        }
        await exec(`git checkout ${tag_name}`, { cwd: projectPath });
        res.json({ message: 'ok' });
    } catch (err) {
        console.error(err);
        res.sendStatus(403);
        res.json({ message: err.message });
    }
});




