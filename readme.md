[![](https://dcbadge.vercel.app/api/server/3E8ca2dkcC)](https://discord.gg/3E8ca2dkcC)

# Jade-Diy Web Installer

The Jade-Diy Web Installer is the open source tool that provides you an easy solution to install a factory file to your device.

## Flashing process

Simply connect your device, select the model and board version and click on flash.

## Development / Run locally

You can use Docker for compiling the application and to run it locally by

```bash
# build the web installer image
docker build . -f Dockerfile -t jade-diy-web-installer

# run the web installer container
docker run --rm -d -p 3000:3000 jade-diy-web-installer
```

and access it by `http://localhost:3000`
