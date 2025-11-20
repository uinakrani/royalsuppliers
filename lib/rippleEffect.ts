// Utility function to create a ripple effect on click
export const createRipple = (e: React.MouseEvent<HTMLElement>) => {
  const element = e.currentTarget
  const rect = element.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  const x = e.clientX - rect.left - size / 2
  const y = e.clientY - rect.top - size / 2
  
  const ripple = document.createElement('span')
  ripple.style.cssText = `
    position: absolute;
    width: ${size}px;
    height: ${size}px;
    left: ${x}px;
    top: ${y}px;
    border-radius: 50%;
    background: rgba(46, 49, 251, 0.3);
    transform: scale(0);
    animation: ripple 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    z-index: 1;
  `
  
  element.style.position = 'relative'
  element.style.overflow = 'hidden'
  element.appendChild(ripple)
  
  setTimeout(() => {
    ripple.remove()
  }, 600)
}

