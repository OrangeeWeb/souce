const glob = require('glob');
const color = require('./color');
const cliProgress = require('cli-progress');
const writeError = require('./plugins/writeError');
const clean = require('./plugins/clean');
const path = require('path');

const task = (files, callback, values) => new Promise(async (resolve, reject) => {
    if (!callback || typeof callback !== 'function') return reject({
        error: 'callback of task is not a function'
    });

    if (typeof files === 'string') {
        return glob(files, async (err, arr) => {
            if (err) return reject(err);
            await callback(arr, values, files).then(resolve, reject);
        });
    }

    if(typeof files == 'object' && files.path) {
        return glob(files.path, async (err, _files) => {
            if(err) return console.log(err);
            if(files.not) _files = _files.filter(file => !files.not.includes(path.extname(file).toLowerCase()));
            await callback(_files, values, files).then(resolve, reject);
        });
    }

    return await callback(files, values, files).then(resolve, reject);
});

const queue = async (files, callbacks, values = []) => new Promise(async (resolve, reject) => {
    const bar = new cliProgress.MultiBar({
            format: color.cyan('{bar}') + ' {value}/{total} Tasks',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true,
            clearOnComplete: true,
            stopOnComplete: true,
            forceRedraw: true
        });

    const b1 = bar.create(callbacks.length, 0);
    const messages = [];

    for await (const callback of callbacks) {
        await task(files, callback, values)
            .then(async (success) => {
                b1.increment();
                if(success && success?.out) bar.log(color.green('[Sauce]: ') + success.out + "\n");
                values.push(success);
                messages.push({success});
            })
            .catch(async (error) => {
                await writeError(error);
                bar.log(color.red('[Sauce]: ') + error + "\n");
                messages.push({error});
                return reject(error);
            });
    }

    bar.stop();

    let cleanError = true;
    for (let i = 0; i < messages.length; i++) {
        const {error, success} = messages[i];
        if(error) {
            console.error(color.red('[Sauce]:'), error);
            cleanError = false;
        }
        if(success && success?.out) console.error(color.green('[Sauce]:'), success.out);
    }

    if(cleanError) await clean('dist/_error.html')();

    resolve(values);
});

const tasks = (files, ...callbacks) => queue(files, callbacks).catch(() => {});

module.exports = {
    task,
    tasks,
    queue
};