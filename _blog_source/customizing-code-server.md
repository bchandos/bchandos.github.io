---
layout: post
published-on: 06 Nov 2021 00:00:00 GMT
title: Creating your own VS Code server in a container
author: Bill Chandos
description: Join me as I setup a Docker container for running Code Server, an open source implementation of the VSCode back-end server.
tags: vscode,code-server,docker,nodejs,postgresql,linux,fedora,open-source
---

## Creating a custom VS Code server in a container
Like many developers today, I really enjoy [VS Code](https://code.visualstudio.com/), Microsoft's popular code editor. Microsoft describes it as "built on open source", which primarily means that, while to underlying code is open source, the application you download and run from Microsoft is not. Microsoft includes telemetry and several proprietary closed-source features in their release version, but the open source base can be packaged and distributed by others, which is what the popular [VSCodium](https://vscodium.com/) project does.

I am by no means an open source zealot but - to be completely frank - I don't trust Microsoft and their rebranding effort as Linux-loving open-source stalwarts. [Others agree](https://dusted.codes/can-we-trust-microsoft-with-open-source). I don't want to become dependent upon a product and an ecosystem that will someday limit my ability to control my own development environment.

But this all seems fine - I should just use VSCodium and move on, right? Well... one of those proprietary features that Microsoft makes available only to their closed VS Code distribution is the [Remote Development](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.vscode-remote-extensionpack) extension, that allows users to spin up Docker containers for specific types of projects (Python, NodeJS, React, etc.) and develop within these containers without effecting their local environments. Need to develop against a specific version of Python or NodeJS that differs from your locally installed versions? No problem, just spin up the appropriate container, install your dependencies, and you're developing like you're in production! This feature is not available in VSCodium - there is a [closed issue](https://github.com/VSCodium/vscodium/issues/196) about it, if you're curious.

So I happily installed VS Code, turned off as much telemetry as I could, and used remote containers for the last year or so. Then my laptop broke, and I had to send it in for repair. This left me without a way to code for a week. I could have just _not coded_ but I remembered [this video](https://www.youtube.com/watch?v=CTix4rYLhSU) I saw of a developer using Samsung DeX to develop in VS Code. I have a Samsung phone, so I decided to give this a try. (Here is a [companion article](https://medium.com/samsung-internet-dev/developing-on-android-phones-visual-studio-code-on-dex-4c99d2e80e91). Some of the specific instructions have changed, but the overall strategy still works.)

And it worked! What I learned quickly, however, is that Android's agressive RAM management causes websites (and that's what VS Code is here, a web application) to need to reload. I also learned how much I rely on dev tools, which just don't exist in mobile browsers.

The tool at the heart of this method - the [`code-server`](https://github.com/cdr/code-server) project - obviously doesn't _need_ to run on a phone, that's just a novel way to approach it and keep everything self-contained. I have a NUC running some home server projects, and so I decided to install `code-server` there, instead. This worked while my laptop was away, and reduced the load on my phone, but it also tied me to my home network. Not that I'm planning to do much coding away from home, but - once I got my laptop back - there was no reason not to run `code-server` in a local Docker container.

Coder, the company behind `code-server` has a Docker image in DockerHub. It works well for a basic setup, but doesn't have any of the installs I need for even a basic web app. Those can be installed, of course, but doing so after creating the container means that all is lost if the container is removed and recreated from the image - which happens! What I want is an image that has all my expected packages (NodeJS, npm, PostgreSQL) as well as some other settings pre-configured.

So I started with [their Dockerfile](https://github.com/cdr/code-server/blob/main/ci/release-image/Dockerfile) and began modifying it. I'll note here only the lines I've added after some (still ongoing) trial and error.

```
ENV DEBIAN_FRONTEND=noninteractive
```

I noticed during my testing that at least one of the packages I am installing (likely PostgreSQL) required user interaction and that cannot be provided during Docker image building, so this environmental variable solves the issue.

```
    python3-venv \
    postgresql \
  && curl -fsSL https://deb.nodesource.com/setup_16.x | bash - \
  && apt-get install -y nodejs \
```

Python 3 is included in Debian 11, but the `venv` module - which creates virtual environments for Python apps - is not. Given that I'm currently only running one container for all my project (see the Lessons and next steps section at the end of the post for more information about this), this module is important. Additionally, I want PostgreSQL installed. Unfortunately, the version of NodeJS that is default in Debian 11 is v12, which is 4 versions behind the current LTS version, so here I am injecting NodeSource's script to add v16 instead. (I couldn't even build this blog post without doing this!)

```
RUN curl -fsSL "https://github.com/cdr/code-server/releases/download/v3.12.0/code-server_3.12.0_amd64.deb" \
  --output "/tmp/code-server_3.12.0_amd64.deb"
```

Coder's build process assumes a local copy of the `code-server` Debian package is available, which is not the case on my local machine, so it must be downloaded. One small issue here is that we have a fixed version. It may make sense to always download the latest release, or to be able to specify a version.

```
RUN curl -fsSL "https://raw.githubusercontent.com/cdr/code-server/1d8806fc425fd5aaf4ac622f2a4d2d33c67b097b/ci/release-image/entrypoint.sh" \
  --output "/usr/bin/entrypoint.sh"
```
Same story with `entrypoint.sh`, the script that runs the code-server.

```
RUN echo "$(head -n -1 /usr/bin/entrypoint.sh ; echo 'sudo service postgresql start' ; tail -1 /usr/bin/entrypoint.sh)" > /usr/bin/entrypoint.sh
```
I was finding that PostgreSQL was not running when I started the container, so I wanted that to happen everytime it starts, which means this interesting command to inject one command (`sudo service postgresql start`) as the second to last line in the file.
```
RUN chmod +x /usr/bin/entrypoint.sh
```
The downloaded and manipulated version of `entrypoint.sh` needs to be executable.
```
RUN mkdir -p /home/coder/.local/share/code-server/User \
 && printf "{\"workbench.colorTheme\": \"Default Dark+\",\"files.autoSave\": \"off\"}" > /home/coder/.local/share/code-server/User/settings.json
```
In order to retain some basic preferences (like using dark them, and turning off file auto-save) between image rebuilds, I inject those settings as appropriate. I have found there are other settings - such as keybindings - and so I am developing another way to include these in the build. Finally ...
```
RUN git config --global user.name "MyUserName" && git config --global user.email "name@example.dev"
```
So git doesn't complain the first time I try to make a commit!

Now I am ready to build my Docker container: `docker build -t code-server .`

Once complete, I am ready to start. I can use the single command provided in Coder's Docker Hub example, but the recommended way to launch a container these days is to use `docker-compose` (which is a separate install - see Docker's doc~~k~~umentation).

```
version: '3.3'
services:
    code-server:
        container_name: code-server
        ports:
            - '127.0.0.1:8080:8080'
            - '3000:3000'
            - '3333:3333'
            - '4444:4444'
            - '5000:5000'
            - '8000:8000'
            - '9000:9000'
        volumes:
            - '$HOME/.config:/home/coder/.config'
            - '$HOME/development:/home/coder/project'
        environment:
            - DOCKER_USER=$USER
        image: code-server
```

In addition to the `code-server` port (8080), I am exposing several other ports that are commonly used by Flask, ExpressJS, React, etc. Perhaps there is a more elegant way to do this... These settings will make available all of the files and folders with my `development/` directory in the remote container, so I can work directly on my locally checked out source code. It also maps the `code-server` config file to a local directory so I can more easily update it, which I have done by removing the password requirement. Finally, my host username is used as the remote container username.

And that's it! I launch the container with `docker-compose up` and within a few seconds, I can load `localhost:8080` in a browser and see a very familiar interface! I use Chromium as it's the recommended browser engine, and I have "installed" the site as a PWA, which makes it available similar to a native application on Fedora, running GNOME.

### Lessons and next steps

This ticks a couple of the boxes:
 - &#9745; Development environment isolated from host machine
 - &#9745; Open source

However, it does not keep development environments _isolated from one another_. Currently, all projects share the same Python or NodeJS or Postgresql version. This was fine for achieving the first two goals above, but next I want to bring this feature closer to parity with Microsoft's proprietary offering.

There are some immediate, obvious challenges here:
 - The current Debian based images are _large_ - over 1GB each; I will need one for each _type_ of project, and a container for each
 - Because each container serves its own code interface, there may be strange behavior between them depending on what is being stored by Chromium
 - Settings and keybindings within each container need to propogate between them
 - The installed app icon kinda ... sucks (sorry Coder), and so I would like to change it

But I hope to address all of them and share the results in another blog post!