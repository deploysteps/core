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
  run,

  copy,
  enforceSshPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';

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

const servers = [
  {
    host: '192.168.1.100',
    port: 22,
    username: 'myAccount',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/user1/.ssh/id_rsa', 'utf8'),
    tasks: [
      updateDebian(),
      syncUsers(users),
      enforceSshPublicKeyOnly(),
      copy('./stacks/example-voting-app', '/Users/myAccount/Documents/example-voting-app', { clean: true }),
    ]
  }
];

run(servers);
```

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

Create a list of servers you want to manage. Each server object should contain the following properties:

- `host`: The server's IP address or hostname.
- `port`: The server's SSH port.
- `username`: The username used to connect to the server.
- `password`: The password used to connect to the server.
- `privateKey`: The private SSH key used to connect to the server.
- `tasks`: An array of tasks to be executed on the server.

Example:

```javascript
const servers = [
  {
    host: '192.168.1.100',
    port: 22,
    username: 'user1',
    password: 'Password@12345',
    privateKey: fs.readFileSync('/Users/myAccount/.ssh/id_rsa', 'utf8'),
    tasks: [
      updateDebian(),
      syncUsers(users),
      enforceSshPublicKeyOnly(),
      copy('./stacks/example-voting-app', '/Users/myAccount/Documents/example-voting-app', { clean: true }),
    ]
  }
];
```

### Tasks

Import the tasks you want to use from the `@deploysteps/core` package:

```javascript
import {
  copy,
  enforceSshPublicKeyOnly,
  syncUsers,
  updateDebian
} from '@deploysteps/core';
```

### Executing Tasks

Iterate over your list of servers and create an SSH connection for each server. Then, execute the tasks on the server and close the connection when done.

A helper `run` function does this for you:

```javascript
run(servers)
```

But it essentially does the following:

```javascript
for (const server of servers)
  const connection = await createSshConnection({
    ip: server.host,
    // ...
  });

  for (const task of server.tasks) {
    console.log('starting', task.name);
    await task.handler(connection);
  }

  connection.close();
}
```

## Available Tasks

DeploySteps provides several built-in tasks that you can use to automate your server management:

### updateDebian

The `updateDebian()` task updates the package list and upgrades installed packages on Debian-based systems.

Usage:

```javascript
updateDebian()
```

### syncUsers

The `syncUsers(users)` task synchronizes the given list of users on the server, ensuring that each user exists with the specified properties.

- `users`: An array of user objects as defined in the [Users Configuration](#users-configuration) section.

Usage:

```javascript
syncUsers(users)
```

### enforceSshPublicKeyOnly

The `enforceSshPublicKeyOnly()` task configures the SSH server to only allow public key authentication, disabling password-based authentication.

Usage:

```javascript
enforceSshPublicKeyOnly()
```

### copy

The `copy(source, destination, options)` task copies files and directories from the local machine to the remote server.

- `source`: The local path of the file or directory to be copied.
- `destination`: The remote path where the file or directory should be copied.
- `options`: An optional object with the following properties:
  - `clean`: A boolean indicating whether to remove the destination directory before copying (default: `false`).

Usage:

```javascript
copy('./stacks/example-voting-app', '/Users/myAccount/Documents/example-voting-app', { clean: true })
```

With the DeploySteps library, you can create custom tasks tailored to your specific needs, allowing for a more versatile and adaptable server management experience. By combining these tasks in various ways, you can create complex and powerful workflows that simplify your devops operations.

## Custom tasks

You can create your own tasks anywhere you like, but in this example we'll just keep it with the code.

This is how a `installVim` script could be implemented.

```javascript
import kleur from "kleur";

export const installVim = () => ({
  name: 'Install VIM',
  handler: async (connection) => {
    await connection.exec(`
      sudo apt-get -qy update
      sudo apt-get -qy install vim
    `);
  }
});
```

## Pipelines

The point of DeploySteps, and ISaaC in general, is to commit your infrastructure scripts into a git repo, and have actions trigger through the CI/CD pipelines.

GitHub Actions provide a powerful and flexible way to automate your deployment workflows. By integrating DeploySteps with GitHub Actions, you can automatically execute your server management tasks whenever changes are pushed to your repository.

To deploy your servers using DeploySteps and GitHub Actions, follow the steps below:

### 1. Create a GitHub Actions Workflow

In your repository, create a new directory called `.github/workflows`, if it doesn't already exist. Inside this directory, create a new file called `deploy.yml`. This file will contain the configuration for your GitHub Actions deployment workflow.

### 2. Configure the Workflow

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

### 3. Configure Secrets

Sensitive information, such as private keys and public keys, should not be stored directly in your repository. Instead, you should use [GitHub Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) to securely store this information.

In your GitHub repository, navigate to the **Settings** tab, and then click on **Secrets**. Add the following secrets:

- `SERVER_PRIVATE_KEY`: The private SSH key used to connect to your server.
- `USER1_PUBLIC_KEY`: The public SSH key for the user you want to manage on the server.

### 4. Create the `sync.js` Script

In your `sync.js` script, replace the file reading operations for private and public keys with the corresponding environment variables provided by GitHub Actions:

```javascript
const servers = [
  {
    host: '192.168.1.100',
    port: 22,
    username: 'myAccount',
    password: 'Password@12345',
    privateKey: process.env.SERVER_PRIVATE_KEY,
    tasks: [
      updateDebian()
    ]
  }
];
```

### 5. Push Your Changes

Commit and push your changes to the `main` branch. GitHub Actions will now automatically execute your deployment workflow whenever you push changes to your repository.

With this setup, you can leverage the power of GitHub Actions and DeploySteps to automate your server management tasks, ensuring your servers stay up-to-date and secure with every push.
