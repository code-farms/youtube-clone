import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";

const generateAccesssAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccesssToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens.",
      error
    );
  }
};

const resisterUser = asyncHandler(async (req, res) => {
  const { userName, fullName, email, password } = req.body;

  if (
    [userName, fullName, email, password].some(
      (fields) => fields?.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const existeduser = await User.findOne({
    $or: [{ userName }, { email }],
  });

  if (existeduser) {
    throw new ApiError(409, "User already exists.");
  }
  const avatarLocalPath = req.files?.avatar[0]?.path;
  // const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  // const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar field is required");
  }

  const user = await User.create({
    userName: userName.toLowerCase(),
    fullName,
    email,
    password,
    avatar: avatar.url,
    // coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering a user");
  }

  res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, password, userName } = req.body;

  console.log(req.body);

  if (!email && !userName) {
    throw new ApiError(400, "User email or username is required!");
  }

  const user = await User.findOne({
    $or: [{ email }, { userName }],
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const isPasswordValid = await user.comparePassword(password);

  if (!isPasswordValid) {
    throw new ApiError(404, "Invalid credentials");
  }

  const { refreshToken, accessToken } = await generateAccesssAndRefreshTokens(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpsOnly: true,
    secure: true,
  };

  return res
    .cookie("refreshToken", refreshToken, options)
    .cookie("accessToken", accessToken, options)
    .status(200)
    .json(
      {
        user: loggedInUser,
        refreshToken,
        accessToken,
      },
      "User logged in successfully!"
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: 1,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpsOnly: true,
    secure: true,
  };

  return res
    .clearCookie("refreshToken", options)
    .clearCookie("accessToken", options)
    .status(200)
    .json(200, {}, "User logged out successfully!");
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unautherised request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken._id);

    if (!user) {
      throw new ApiError(401, "Invalid request");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired");
    }

    const options = {
      httpsOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccesssAndRefreshTokens(user._id);

    return res
      .status(200)
      .cookies("accesstoken", accessToken, options)
      .cookies("refreshtoken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: newRefreshToken },
          "Access token hass refreshed"
        )
      );
  } catch (error) {
    new ApiError(401, error?.message, "Invalid access token.");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  // Extract the old password and new password
  const { oldPassword, newPassword } = req.body;

  // Get the current user data from the server
  const user = await User.findById(req.user?._id);

  // Check if the old password is correct
  const isPasswordValid = await user.comparePassword(oldPassword);

  // Throw error if the old password is incorrect
  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid old password");
  }

  // Changed the password
  user.password = newPassword;

  await user.save({ validateBeforeSave: true });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password has been changed successfully!"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  // Get the current user from the req.user object
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "Current user fetched successfully!"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  // Extract the body data from the request
  const { fullName, email } = req.body;

  // Throw error if data is not available
  if (!(email && fullName)) {
    throw new ApiError(400, "All fields are required!");
  }

  // Get the current user from the req.user object
  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully!"));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  // Extract the files from the request
  const avatarLocalPath = req.file?.path;

  // Throw error if Avatar file is available or not
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is not available.");
  }

  // Upload the avatar file to the cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw new ApiError(400, "Error while uploading on avatar.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { avatar: avatar.url } },
    { new: true }
  ).select("-password");

  return res.status(200).json(200, user, "Avatar image updated successfully!");
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  // Extract the files from the request
  const coverImageLocalPath = req.file?.path;

  // Throw error if cover image file is available or not
  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover Image is not available.");
  }

  // Upload the cover image file to the cloudinary
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw new ApiError(400, "Error while uploading on cover image.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    { $set: { coverImage: coverImage.url } },
    { new: true }
  ).select("-password");

  return res.status(200).json(200, user, "Cover image updated successfully!");
});

export {
  resisterUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
