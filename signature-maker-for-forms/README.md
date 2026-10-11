# Signature Maker for Forms

A free **signature maker** for anyone whose online form says *"Signature: JPG, 140 × 60 pixels, 10 to 20 KB, black ink on white paper"*: job and exam applications, university admissions, bank, visa and government forms. **Sign on screen** with a finger, pen or mouse, or **use a photo of your signature on paper**: grey paper, shadows and the table under the page are cleaned away and only the ink is kept. Pick the size the form asks for (140 × 60 px and 10 to 20 KB is ready to go, or type any pixels and KB) and download a clean file that the form accepts. Need to sign a PDF or Word document instead? Choose **See-through PNG** and the signature has no background at all. Everything happens **on your device**: your signature is never uploaded. No account, no ads, works offline.

**Live demo:** [umar8092.github.io/apps/signature-maker-for-forms](https://umar8092.github.io/apps/signature-maker-for-forms/)

| Desktop | On a phone |
|---|---|
| ![Signature Maker for Forms on a laptop: a handwritten signature in the white signing box on the left, the size 140 × 60 px, 10 to 20 KB, JPG on the right, and below it the finished file of 10.1 KB with the green line Between 10 KB and 20 KB. Ready to upload, and a Download button](screenshots/desktop.png) | <img src="screenshots/phone.png" alt="Signature Maker for Forms on a phone: the finished signature file of 10.1 KB at 140 × 60 px with the green line Between 10 KB and 20 KB. Ready to upload, the signature at real size, and Download and Copy picture buttons" width="220"> |

## The situation it solves

Bilal is applying for a government job online. The form asks for **"Signature: JPG, 140 × 60 pixels, between 10 KB and 20 KB"**. He has no scanner. A phone photo of his signature is **3 MB, 4000 × 3000 pixels**, grey, with a shadow and the edge of the table in it, and the form keeps saying *invalid file*. He does not want to upload his signature to a random website.

He opens the app on his phone and signs in the white box with his finger. Without touching anything else, box 3 shows:

- **10.1 KB**
- **Between 10 KB and 20 KB. Ready to upload.**
- *140 × 60 px, JPG with a white background, 10,440 bytes. Topped up to reach 10 KB with empty space inside the file. The picture is unchanged.*
- *At real size:* the signature exactly as the form will see it.

He taps **Download**, gets `signature-140x60.jpg`, and uploads it. The form accepts it.

The same day his sister needs a signature for a different form: **350 × 150 px, 20 to 100 KB**. She signs on paper, taps **Use a photo** and chooses the photo. The dashed box shows the part found as her signature (the table at the edge of the photo is left out), she picks **350 × 150 px, 20 to 100 KB** and gets a 20.1 KB file. Later she signs a rental agreement in PDF: she picks **See-through PNG for PDFs**, taps **Copy picture** and pastes it onto the page.

Other cases it handles:

- **A clean signature is naturally tiny** (a 140 × 60 JPG is about 3 KB). When the form asks for **at least** a size, empty space is added inside the file (JPEG comment or PNG text blocks). The picture is unchanged; only the file size grows.
- **1000 or 1024?** *Under 20 KB* is made at most 20,000 bytes and *at least 10 KB* at least 10,240 bytes, so it passes however the website counts.
- **Never stretched.** The signature is made as big as fits inside the pixels, with a little space around it, and centred. A tall signature in a wide box keeps its shape.
- **Faint at real size?** Lines never go thinner than about 1.5 pixels in the file, and **Thick** makes it bolder. Black or blue ink, whichever the form wants.
- **Photos:** shadows, grey, dark or yellowish paper, a light pen (**Clean-up** towards **Keep faint ink**), a lined page (towards **Whiter paper**), marks touching the edge of the photo, specks far away, the dot of an *i* kept, a sideways photo (**Rotate**), and a box drawn by hand when it picks up something else (**Use the whole photo** undoes it). Blank paper, PDFs, text files, empty and damaged files and HEIC in browsers that cannot open it each get a plain message, and a new photo can be undone.
- **Impossible sizes** say so plainly instead of making a broken file, for example *As a PNG at 3000 × 3000 px this signature is 287 KB, over the 2 KB limit. Choose JPG, or a bigger limit.*
- **Typing mistakes:** a width without a height, decimals, 0, negative numbers, words, over 4000 px or 10 MB, and *At least* bigger than *Must be under* each get a message under the box, and nothing can be downloaded until it is fixed. Pasted values like `20kb` or `1,5 MB` are understood.
- **The next form:** the size you used is remembered, and **Remember my signature on this device** (off by default) keeps the signature itself for next time. Unticking it deletes it.
- **Start over** with **Undo**, **Undo last line**, and **Clear** with **Undo**. Turning the phone sideways keeps the signature. If the browser blocks storage the app still works.

## Features

- **Help button** at the top for a short how-to, **All apps** to go back to the list, and a **Light mode / Dark mode** switch. The signing box is always white, like paper.
- **1. Your signature:** **Sign on screen** (finger, pen or mouse, smooth lines, **Undo last line**, **Clear**, **Line thickness** Thin / Medium / Thick) or **Use a photo** (cleaned automatically, dashed box shows what is used, drag your own box, **Clean-up**, **Rotate**, **Choose another photo**, paste a picture with Ctrl+V). **Ink colour** Black or Blue.
- **2. The size the form asks for:** quick picks *140 × 60 px, 10 to 20 KB*, *140 × 60 px, 4 to 30 KB*, *350 × 150 px, 20 to 100 KB*, *354 × 157 px, 10 to 50 KB*, *Under 100 KB, any pixels* (all JPG) and *See-through PNG for PDFs*, or **Your own size** with width and height, **Must be under**, and **+ Add a smallest size (optional)**. JPG (white background) or PNG (see-through).
- **3. Your signature file:** a large preview, the size in big type, a green line when it fits, the exact pixels and bytes, the signature **at real size**, **Download** with a clear name (`signature-140x60.jpg`), **Share** on phones, **Copy picture** to paste into a document.
- Keeps JPG quality as high as the limit allows, and with no exact pixels makes the picture smaller only when it has to.
- **Private, works offline and installable.** Phone and desktop layouts. The tabs work with the arrow keys, and results are read out to screen readers.

## Run it yourself

No build step and no dependencies.

```bash
git clone https://github.com/umar8092/apps.git
```

Then open `signature-maker-for-forms/index.html` in your browser. Offline mode and install need the files served over `https` or `localhost` (for example `python3 -m http.server`).

## How it works

- `core.js` holds the rules with no page code: reading the sizes people type, the byte limits (1000 for "under", 1024 for "at least"), where the signature goes in the box, the photo cleaning, the size search and the padding. Cleaning works on brightness: the paper's brightness is found block by block (the brightest pixel nearby, smoothed), so each pixel is compared with the paper around it and shadows and grey paper become white. Marks are then grouped; groups that touch the edge of the photo and specks far from the signature are dropped.
- `script.js` builds the page. Signatures signed on screen are stored as lines (points as fractions of the box width) and drawn again sharply at the exact size of the file. Photos are drawn on a canvas, cleaned, and shrunk in halves so thin lines stay smooth; small files get their ink darkened a little. Files are made with `canvas.toBlob`. Only your size, pen and (if you ask) signature are saved, in this browser's storage under `signature-maker-for-forms.*`.
- `sw.js` saves the app for offline use (network first, so updates always arrive).
- Checks: `node tests.js` for the rules, the cleaning on a made-up photo, the search with a pretend encoder and the padding (also `test.html` in a browser), and `node ui-test.js` drives the real page in headless Chromium: signing with the mouse, photos with shadows and a table, every size and mistake, remembering, undo, odd files, every screen size and both themes (add `--base https://umar8092.github.io/apps` to test the live site).

## License

[MIT](LICENSE). Free to use, copy, modify and share. Made by [Muhammad Umar](https://github.com/umar8092).
