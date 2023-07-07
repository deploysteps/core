# DeploySteps

DeploySteps is a simple and flexible ISaaC library that allows you to automate various tasks in your server management workflow. By providing a simple and intuitive API, DeploySteps enables you to create reusable and idempotent tasks that can be run on multiple servers with ease.

## Table of Contents

- [Concept](#concept)
- [Installation](#installation)
- [Usage](#usage)
  - [Users Configuration](#users-configuration)
  - [Servers Configuration](#servers-configuration)
  - [Tasks](#tasks)
  - [Executing Tasks](#executing-tasks)
- [Available Tasks](#available-tasks)
  - [updateDebian](#updatedebian)
  - [syncUsers](#syncusers)
  - [enforceSshPublicKeyOnly](#enforcesshpublickeyonly)
  - [copy](#copy)
- [Pipelines](#pipelines)

## Concept

The core concept of DeploySteps is to create a list of tasks that you want to execute on your servers. These tasks are defined as reusable and idempotent functions that can be executed on your target servers. This ensures that running the same task multiple times will not cause any unintended side effects.

## Installation

Install DeploySteps by running the following command in your project directory:

```bash
npm install --save @deploysteps/core
```

## Usage

To use DeploySteps, you'll need to create a script that defines a set of servers and task you want to run.

### Basic example

```javascript
import fs from 'fs';
import {
  createSshConnection,

  copy,
  enforceSshOtpAndPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';

const users = [
  {
    username: 'user1',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/user1/.ssh/id_rsa', 'utf8'),
    publicKeys: [
      fs.readFileSync('/Users/user1/.ssh/id_rsa.pub', 'utf8')
    ],
    groups: ['sudo']
  }
];

const $ = await createSshConnection({
  host: '192.168.1.100',
  port: 22,
  username: users[0].username,
  password: users[0].password,
  otpSecret: users[0].otpSecret,
  privateKey: users[0].privateKey
});

await updateDebian($);
await syncUsers($, users);
await enforceSshOtpAndPublicKeyOnly($);
await copy($, './stacks', '/Users/user1/Documents/stacks', { clean: true });
await $.close();
```

### Extra
- [@deploysteps/docker](https://github.com/deploysteps/docker)

### Users Configuration

Create a list of users you want to manage on your servers. Each user object should contain the following properties:

- `username`: The user's username.
- `password`: The user's password.
- `publicKeys`: An array of the user's public SSH keys.
- `groups`: An array of the groups the user should belong to.

Example:

```javascript
const users = [
  {
    username: 'user1',
    password: 'Password@12345',
    publicKeys: [
      fs.readFileSync('/Users/user1/.ssh/id_rsa.pub', 'utf8')
    ],
    groups: ['sudo']
  }
];
```

### Servers Configuration

Create a new SSH connection to a remote host.

- `host`: The server's IP address or hostname.
- `port`: The server's SSH port.
- `otpSecret`: The secret for generation otp tokens during login.
- `username`: The username used to connect to the server.
- `password`: The password used to connect to the server.
- `privateKey`: The private SSH key used to connect to the server.

Example:

```javascript
createSshConnection(
  {
    host: '192.168.1.100',
    port: 22,
    username: 'user1',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/myAccount/.ssh/id_rsa', 'utf8')
  }
)
```

### Tasks

Import the tasks you want to use from the `@deploysteps/core` package:

```javascript
import {
  copy,
  enforceSshOtpAndPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';
```

## Available Tasks

DeploySteps provides several built-in tasks that you can use to automate your server management:

### updateDebian

The `updateDebian($)` task updates the package list and upgrades installed packages on Debian-based systems.

Usage:

```javascript
updateDebian($)
```

### createDirectory

The `createDirectory($, destination)` task ensures a directory exists.

Usage:

```javascript
createFile($, '/tmp/test');
```

### createFile

The `createFile($, destination, data)` task creates/overwrites a file with some content.

Usage:

```javascript
createFile($, '/tmp/test/file.txt', 'Hello World');
```

### syncUsers

The `syncUsers($, users)` task synchronizes the given list of users on the server, ensuring that each user exists with the specified properties.

- `$`: An ssh connection object
- `users`: An array of user objects as defined in the [Users Configuration](#users-configuration) section.

Usage:

```javascript
await syncUsers($, users)
```

### enforceSshPublicKeyOnly

The `enforceSshPublicKeyOnly()` task configures the SSH server to only allow public key authentication, disabling password-based authentication.

Usage:

```javascript
await enforceSshPublicKeyOnly($)
```

- `$`: An ssh connection object

### copy

The `copy($, source, destination, options)` task copies files and directories from the local machine to the remote server.

- `$`: An ssh connection object
- `source`: The local path of the file or directory to be copied.
- `destination`: The remote path where the file or directory should be copied.
- `options`: An optional object with the following properties:
  - `clean`: A boolean indicating whether to remove the destination directory before copying (default: `false`).

Usage:

```javascript
await copy($, './stacks/example-voting-app', '/Users/myAccount/Documents/example-voting-app', { clean: true })
```

With the DeploySteps library, you can create custom tasks tailored to your specific needs, allowing for a more versatile and adaptable server management experience. By combining these tasks in various ways, you can create complex and powerful workflows that simplify your devops operations.

## Custom tasks

You can create your own tasks anywhere you like, but in this example we'll just keep it with the code.

This is how a `installVim` script could be implemented.

```javascript
export const installVim = async (connection) => {
  await connection.exec(`
    sudo apt-get -qy update
    sudo apt-get -qy install vim
  `);
};
```

## Pipelines

The point of DeploySteps, and IaC (infrastructure as code) in general, is to commit your infrastructure scripts into a git repo, and have actions trigger through the CI/CD pipelines.

GitHub Actions provide a powerful and flexible way to automate your deployment workflows. By integrating DeploySteps with GitHub Actions, you can automatically execute your server management tasks whenever changes are pushed to your repository.

To deploy your servers using DeploySteps and GitHub Actions, follow the steps below:

### Create a GitHub Actions Workflow

In your repository, create a new directory called `.github/workflows`, if it doesn't already exist. Inside this directory, create a new file called `deploy.yml`. This file will contain the configuration for your GitHub Actions deployment workflow.

### Configure the Workflow

Add the following YAML configuration to your `deploy.yml` file:

```yaml
name: Deploy

on:
  schedule:
    # Runs "At 22:00 on every day-of-week from Monday through Friday."
    - cron: '0 22 * * 1-5'
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - name: Checkout repository
      uses: actions/checkout@v2

    - name: Set up Node.js
      uses: actions/setup-node@v2
      with:
        node-version: 18

    - name: Install dependencies
      run: npm ci

    - name: Deploy to servers
      run: node sync.js
      env:
        PRIVATE_KEY: ${{ secrets.SERVER_PRIVATE_KEY }}
        USER1_PUBLIC_KEY: ${{ secrets.USER1_PUBLIC_KEY }}
```

This configuration sets up a workflow that triggers whenever you push changes to the `main` branch. It checks out your repository, sets up Node.js, installs your dependencies, and runs your `sync.js` script.
