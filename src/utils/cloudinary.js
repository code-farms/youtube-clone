import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) {
      return null;
    }
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    console.log("File has uploaded successfully");
    console.log(response);
    return response;
  } catch (error) {
    // Remove the file from the locally saved file as the upload operation failed
    false.unlinkSync(localFilePath);
    return null;
  }
};

export { uploadOnCloudinary };
