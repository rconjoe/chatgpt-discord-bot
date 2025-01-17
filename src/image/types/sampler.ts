export const ImageSamplers = [
    "DDIM", "DDPM", "K_DPMPP_2M", "K_DPMPP_2S_ANCESTRAL", "K_DPM_2", "K_DPM_2_ANCESTRAL",
    "K_EULER", "K_EULER_ANCESTRAL", "K_HEUN", "K_LMS"
]

export type ImageSampler = typeof ImageSamplers[number]
