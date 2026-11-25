export async function compressImageForUpload(
  uri: string,
): Promise<{ base64: string; mimeType: "image/jpeg" }> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Imaginea nu a putut fi încărcată."));
    image.src = uri;
  });

  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Imaginea nu are dimensiuni valide.");
  }

  const width = Math.min(image.naturalWidth, 1024);
  const height = Math.round(image.naturalHeight * (width / image.naturalWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas-ul nu este disponibil pentru comprimarea imaginii.");

  context.drawImage(image, 0, 0, width, height);
  const encoded = canvas.toDataURL("image/jpeg", 0.75);
  const separator = encoded.indexOf(",");
  if (separator < 0 || !encoded.startsWith("data:image/jpeg;base64,")) {
    throw new Error("Imaginea nu a putut fi comprimată.");
  }

  return { base64: encoded.slice(separator + 1), mimeType: "image/jpeg" };
}
